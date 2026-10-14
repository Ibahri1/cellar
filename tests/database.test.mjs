import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {allRackPositions,bottom} from '../src/domain.ts';

const db=new PGlite();
const admin='11111111-1111-4111-8111-111111111111',session='22222222-2222-4222-8222-222222222222';
const testWine={name:'TEST FIXTURE Cabernet',producer:'TEST FIXTURE Producer',vintage:2020,wine_type:'Red',country:'France',region:'Test region',grape_variety:'Cabernet Sauvignon',bottle_size:750};
const rack=(r,c,d)=>({location_type:'RACK',row_number:r,column_number:c,depth_number:d});
async function auth(user=admin,sid=session){await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user,session_id:sid})]);await db.exec('set role authenticated');}
async function call(action,payload,id=randomUUID()){return (await db.query('select public.mutate_cellar($1,$2::jsonb,$3::uuid) as result',[action,JSON.stringify(payload),id])).rows[0].result;}
async function snapshot(){return (await db.query('select public.cellar_snapshot() as data')).rows[0].data;}
before(async()=>{
 await db.exec(`create role anon; create role authenticated;
 create schema auth;
 create table auth.users(id uuid primary key);
 create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz default now(),not_after timestamptz);
 create function auth.jwt() returns jsonb language sql stable as $$ select nullif(current_setting('request.jwt.claims',true),'')::jsonb $$;
 create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
 grant usage on schema auth to authenticated;
 create publication supabase_realtime;
 insert into auth.users(id) values ('${admin}'),('33333333-3333-4333-8333-333333333333');
 insert into auth.sessions(id,user_id) values ('${session}','${admin}');`);
 await db.exec(await readFile(new URL('../supabase/migrations/20261014003753_cellar_inventory.sql',import.meta.url),'utf8'));
 await db.query('insert into private.admin_access(user_id) values($1)',[admin]);
 await db.query('select private.authorize_login($1,$2)',[session,admin]);
 await auth();
});
after(()=>db.close());

test('database integrity, RLS, atomic writes, conflicts, history and sessions',async t=>{
 let rackIds,bottomIds;
 await t.test('anonymous and other identities cannot read or mutate private inventory',async()=>{
  await db.exec('reset role; set role anon');
  await assert.rejects(db.query('select * from public.bottles'),/permission denied/);
  await assert.rejects(db.query('select public.cellar_snapshot()'),/permission denied/);
  await auth('33333333-3333-4333-8333-333333333333');
  assert.equal((await db.query('select * from public.bottles')).rows.length,0);
  await assert.rejects(snapshot(),/AUTH_REQUIRED/);await assert.rejects(call('add',{wine:testWine,placements:[bottom]}),/AUTH_REQUIRED/);
  await auth();
 });
 await t.test('standard Auth sessions must be registered by the restricted login function',async()=>{
  const sid=randomUUID();await db.exec('reset role');await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sid,admin]);await auth(admin,sid);
  await assert.rejects(snapshot(),/AUTH_REQUIRED/);
  await db.exec('reset role; set role cellar_login');assert.equal((await db.query('select private.authorize_login($1,$2) as ok',[sid,admin])).rows[0].ok,true);
  await auth(admin,sid);assert.equal((await snapshot()).bottles.length,0);await auth();
 });
 await t.test('add all 180 rack locations and additional bottom bottles',async()=>{
  rackIds=await call('add',{wine:testWine,placements:allRackPositions()});
  bottomIds=await call('add',{wine:testWine,placements:Array.from({length:200},()=>bottom)});
  assert.equal(rackIds.length,180);assert.equal(bottomIds.length,200);
  assert.equal((await snapshot()).bottles.length,380);
  assert.equal((await db.query('select count(*)::integer as n from public.activity_history')).rows[0].n,380);
 });
 await t.test('duplicate rack occupancy and invalid coordinates roll back the whole batch',async()=>{
  const before=(await snapshot()).bottles.length;
  await assert.rejects(call('add',{wine:testWine,placements:[bottom,rack(1,1,1)]}),/unique constraint/);
  for(const p of [rack(13,1,1),rack(1,6,1),rack(1,1,4),rack(null,1,1),{...bottom,row_number:1}])
   await assert.rejects(call('add',{wine:testWine,placements:[p]}),/check constraint/);
  assert.equal((await snapshot()).bottles.length,before);
 });
 await t.test('retries are idempotent and changed request payloads are rejected',async()=>{
  const id=randomUUID(),payload={wine:testWine,placements:[bottom]};
  assert.deepEqual(await call('add',payload,id),await call('add',payload,id));
  await assert.rejects(call('add',{...payload,personal_notes:'different'},id),/REQUEST_REUSED/);
 });
 await t.test('direct writes and history tampering cannot bypass the mutation API',async()=>{
  await assert.rejects(db.query("update public.bottles set personal_notes='bypass'"),/permission denied/);
  await assert.rejects(db.query('delete from public.activity_history'),/permission denied/);
  await assert.rejects(db.query("insert into public.wines(name,wine_type) values('bypass','Red')"),/permission denied/);
  await assert.rejects(db.query('select private.consume_login_attempt()'),/permission denied/);
  await assert.rejects(db.query('select private.authorize_login($1,$2)',[session,admin]),/permission denied/);
 });
 await t.test('moves reject occupied destinations and stale edit versions',async()=>{
  await assert.rejects(call('move',{id:bottomIds[0],version:1,location:rack(1,1,1)}),/unique constraint/);
  await call('move',{id:rackIds[0],version:1,location:bottom});
  await call('move',{id:bottomIds[0],version:1,location:rack(1,1,1)});
  await assert.rejects(call('move',{id:bottomIds[0],version:1,location:bottom}),/EDIT_CONFLICT/);
  const b=(await snapshot()).bottles.find(b=>b.id===bottomIds[0]);assert.equal(b.location_type,'RACK');assert.equal(b.version,2);
 });
 await t.test('editing one bottle preserves other bottles and immutable wine history',async()=>{
  await call('edit',{id:rackIds[1],version:1,wine:{...testWine,name:'TEST FIXTURE Edited wine'},personal_rating:5,personal_notes:'Test note'});
  const {bottles}=await snapshot();assert.equal(bottles.find(b=>b.id===rackIds[1]).wine.name,'TEST FIXTURE Edited wine');
  assert.equal(bottles.find(b=>b.id===rackIds[2]).wine.name,testWine.name);
  const history=(await db.query("select wine_name from public.activity_history where bottle_id=$1 and action='Added'",[rackIds[1]])).rows[0];assert.equal(history.wine_name,testWine.name);
 });
 await t.test('Drank and Gifted free rack space, retain records and append dated history',async()=>{
  await call('Drank',{id:rackIds[2],version:1});await call('Gifted',{id:rackIds[3],version:1});
  await assert.rejects(call('Drank',{id:rackIds[2],version:2}),/BOTTLE_REMOVED/);
  await assert.rejects(call('move',{id:rackIds[2],version:2,location:bottom}),/BOTTLE_REMOVED/);
  const {bottles}=await snapshot();assert.ok(bottles.find(b=>b.id===rackIds[2]).removed_at);
  assert.equal(bottles.find(b=>b.id===rackIds[3]).status,'Gifted');
  await call('move',{id:bottomIds[1],version:1,location:rack(1,1,3)});
  const h=(await db.query("select * from public.activity_history where bottle_id=$1 and action='Drank'",[rackIds[2]])).rows[0];assert.equal(h.previous_location,'R1-C1-D3');assert.equal(h.new_location,null);assert.ok(h.created_at);
 });
 await t.test('revoked and expired sessions cannot read or write even with the same identity',async()=>{
  await db.exec('reset role');await db.query("update auth.sessions set created_at=now()-interval '9 hours' where id=$1",[session]);await auth();
  await assert.rejects(snapshot(),/AUTH_REQUIRED/);assert.equal((await db.query('select * from public.bottles')).rows.length,0);
  await db.exec('reset role');await db.query('delete from auth.sessions where id=$1',[session]);await auth();await assert.rejects(call('add',{wine:testWine,placements:[bottom]}),/AUTH_REQUIRED/);
 });
 await t.test('restricted login role has an atomic global throttle and no inventory access',async()=>{
  await db.exec('reset role; set role cellar_login');
  for(let i=0;i<12;i++){const allowed=(await db.query('select private.consume_login_attempt() as allowed')).rows[0].allowed;assert.equal(allowed,i<10);}
  await assert.rejects(db.query('select * from public.bottles'),/permission denied/);
  await db.exec('reset role');
 });
});
