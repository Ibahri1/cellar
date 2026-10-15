// Loopback emulator only. EXPECT_STALE_RULES=1 diagnoses the pre-upgrade rules.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,runTransaction,serverTimestamp,Timestamp} from 'firebase/firestore';
import {saveMutation,encodeWine} from '../src/firestore.ts';

let env,db;
const stale=process.env.EXPECT_STALE_RULES==='1';
const wine={id:'existing-wine',name:'TEST Existing Wine',producer:'TEST Producer',vintage:2020,wine_type:'Red',country:'France',region:'Bordeaux',grape_variety:'Blend',bottle_size:750,tasting_notes:'',image_url:null};
const placement={location_type:'RACK',row_number:7,column_number:2,depth_number:3};
before(async()=>{
 assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8080');
 const rules=await readFile(new URL('../firestore.rules',import.meta.url),'utf8');
 const owner=rules.match(/request\.auth\.uid\s*==\s*'([^']+)'/)?.[1];assert.ok(owner,'Explicit administrator UID must remain in the rules.');
 env=await initializeTestEnvironment({projectId:'demo-private-cellar',firestore:{host:'127.0.0.1',port:8080,rules}});
 await env.clearFirestore();db=env.authenticatedContext(owner).firestore();
 // Existing legacy wine is created through the rules, not a privileged bypass.
 await setDoc(doc(db,'wines',wine.id),{...encodeWine(wine,wine.id),drinkingWindowStart:null,drinkingWindowEnd:null});
});
after(async()=>{await env?.cleanup();});

function operation(extra={}){return {action:'add',requestId:randomUUID(),payload:{wine_id:wine.id,placements:[placement],personal_notes:'',personal_rating:null,price_cents:null,...extra}};}
// Mirror the three writes to isolate an individual rule condition. The existing
// wine is read in the transaction, so its read-version precondition is checked.
async function direct({optional={},bottle={},history={},position={},omitHistory=false,omitReservation=false}={}){
 const id=randomUUID(),historyId=randomUUID();
 await runTransaction(db,async transaction=>{
  const saved=(await transaction.get(doc(db,'wines',wine.id))).data();
  const next={id,wineId:wine.id,locationType:'RACK',row:7,column:2,depth:3,locationKey:'R7-C2-D3',status:'In Cellar',version:1,personalRating:null,personalNotes:'',removedAt:null,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),lastActivityId:historyId,...optional,...bottle};
  transaction.set(doc(db,'bottles',id),next);
  if(!omitReservation)transaction.set(doc(db,'positions','R7-C2-D3'),{id:'R7-C2-D3',bottleId:id,...position});
  if(!omitHistory)transaction.set(doc(db,'activityHistory',historyId),{id:historyId,bottleId:id,wineId:wine.id,wineName:saved.name,vintage:saved.vintage,action:'Added',bottleVersion:1,previousLocation:null,newLocation:'R7-C2-D3',requestHash:'a'.repeat(64),createdAt:serverTimestamp(),...history});
 });
 return id;
}
async function emptyRack(){
 // Release via the real transaction path, preserving the bottle and history.
 const reservation=await getDoc(doc(db,'positions','R7-C2-D3'));
 if(reservation.exists()){const id=reservation.data().bottleId,b=(await getDoc(doc(db,'bottles',id))).data();await saveMutation(db,{action:'Gifted',requestId:randomUUID(),payload:{id,version:b.version}});}
}

test('exact R7-C2-D3 reused-wine transaction: null price/photo, timestamps and read verification',async()=>{
 const op=operation();
 if(stale){
  await assertFails(saveMutation(db,op));
  for(const optional of [{priceCents:null},{photoId:null}])await assertFails(direct({optional}));
  const id=await direct();assert.ok((await getDoc(doc(db,'bottles',id))).exists());
  console.log('REPRODUCED: each optional null key is denied; the identical three-write transaction with both keys omitted succeeds.');
 }else{
  await saveMutation(db,op);const id=`${op.requestId}_0`,b=(await getDoc(doc(db,'bottles',id))).data();
  assert.equal(b.priceCents,null);assert.equal(b.photoId,null);assert.equal(b.version,1);
  assert.equal(b.createdAt.toMillis(),b.updatedAt.toMillis());
  const h=(await getDoc(doc(db,'activityHistory',id))).data();assert.equal(h.createdAt.toMillis(),b.createdAt.toMillis());assert.equal(h.newLocation,'R7-C2-D3');
  assert.equal((await getDoc(doc(db,'positions','R7-C2-D3'))).data().bottleId,id);
 }
 await emptyRack();
});

test('optional keys may be omitted, individually null, or both null',{skip:stale},async()=>{
 for(const optional of [{},{priceCents:null},{photoId:null},{priceCents:null,photoId:null}]){await direct({optional});await emptyRack();}
});

test('reused-wine saves accept a price and an atomic private photo',{skip:stale},async()=>{
 const photo='data:image/jpeg;base64,'+(await readFile(new URL('./fixtures/test-bottle.jpg',import.meta.url))).toString('base64');
 for(const extra of [{price_cents:1999},{photo_data:photo},{price_cents:7500,photo_data:photo}]){
  const op=operation(extra);await saveMutation(db,op);const b=(await getDoc(doc(db,'bottles',`${op.requestId}_0`))).data();
  assert.equal(b.priceCents,extra.price_cents??null);
  if(extra.photo_data)assert.equal((await getDoc(doc(db,'photos',b.photoId))).data().dataUrl,photo);else assert.equal(b.photoId,null);
  await emptyRack();
 }
});

test('all reservation, history, timestamp and optional-field failures still reject atomically',{skip:stale},async()=>{
 const old=Timestamp.fromMillis(0);
 for(const change of [
  {omitHistory:true},{omitReservation:true},{position:{bottleId:'wrong-bottle'}},
  {bottle:{locationKey:'R7-C2-D2'}},{bottle:{createdAt:old}},{bottle:{updatedAt:old}},
  {history:{bottleId:'wrong-bottle'}},{history:{wineId:'wrong-wine'}},{history:{wineName:'wrong-name'}},
  {history:{vintage:1999}},{history:{action:'Moved'}},{history:{bottleVersion:2}},
  {history:{previousLocation:'R1-C1-D1'}},{history:{newLocation:'R7-C2-D2'}},
  {history:{createdAt:old}},{history:{requestHash:'invalid'}},
  {optional:{priceCents:-1}},{optional:{priceCents:19.99}},
  {optional:{photoId:'missing-photo'}},{optional:{photoId:123}},{optional:{unexpected:true}}
 ]){await assertFails(direct(change));assert.equal((await getDoc(doc(db,'positions','R7-C2-D3'))).exists(),false);}
});
