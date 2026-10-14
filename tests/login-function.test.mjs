// Unit tests use mocked Auth/DB services; they do not verify a real password,
// deploy a function, or imply that a Supabase project is configured.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

const source=await readFile(new URL('../supabase/functions/admin-login/index.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source.replace(/^import .*$/gm,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const origin='https://cellar.test';
function setup({rate=true,authorized=true,passwordValid=true,validSession=true,configured=true,dbThrows=false}={}){
 let handler,checks=0,revoked=0;
 const token=`fixture.${Buffer.from(JSON.stringify({session_id:'22222222-2222-4222-8222-222222222222'})).toString('base64url')}.fixture`;
 const fakeSql=async(strings)=>{if(dbThrows)throw Error('DO NOT EXPOSE: database details');return strings.join('').includes('consume_login')?[{allowed:rate}]:[{allowed:authorized}];};
 const client={auth:{signInWithPassword:async()=>{checks++;return passwordValid?{data:{session:{access_token:token,refresh_token:'test-refresh-token',expires_at:9999999999,token_type:'bearer'},user:{id:'11111111-1111-4111-8111-111111111111',email:'test-internal@invalid.test'}}}:{data:{session:null},error:{status:400}};},signOut:async()=>{revoked++;}},rpc:async()=>({data:validSession})};
 const env={ALLOWED_ORIGINS:origin,LOGIN_DATABASE_URL:configured?'test-db':undefined,SUPABASE_URL:'https://project.test',AUTH_PUBLISHABLE_KEY:'test-public-key',ADMIN_EMAIL:'test-internal@invalid.test'};
 new Function('createClient','postgres','Deno',compiled)(()=>client,()=>fakeSql,{env:{get:k=>env[k]},serve:fn=>{handler=fn;}});
 return {handler,checks:()=>checks,revoked:()=>revoked};
}
function request(body={password:'test-only-input'},options={}){return new Request('https://project.test/functions/v1/admin-login',{method:'POST',headers:{origin,'Content-Type':'application/json',...options.headers},body:typeof body==='string'?body:JSON.stringify(body),...options});}

test('login allows configured origin, verifies server-side and returns only standard session tokens',async()=>{
 const s=setup();const response=await s.handler(request());assert.equal(response.status,200);const result=await response.json();assert.equal(result.refresh_token,'test-refresh-token');assert.equal(result.user,undefined);assert.equal(result.email,undefined);assert.equal(s.checks(),1);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);
});
test('login rejects incorrect passwords and rate limited attempts',async()=>{
 const bad=setup({passwordValid:false});assert.equal((await bad.handler(request())).status,401);
 const limited=setup({rate:false});const response=await limited.handler(request());assert.equal(response.status,429);assert.equal(limited.checks(),0);assert.equal(response.headers.get('Retry-After'),'900');
});
test('login fails closed on missing config, database failures and non-admin sessions',async()=>{
 assert.equal((await setup({configured:false}).handler(request())).status,503);
 const db=await setup({dbThrows:true}).handler(request());assert.equal(db.status,503);assert.ok(!(await db.text()).includes('DO NOT EXPOSE'));
 const denied=setup({authorized:false});assert.equal((await denied.handler(request())).status,403);assert.equal(denied.revoked(),1);
 const invalid=setup({validSession:false});assert.equal((await invalid.handler(request())).status,403);assert.equal(invalid.revoked(),1);
});
test('login enforces origin, method, bounded bodies and password validation',async()=>{
 const {handler}=setup();
 assert.equal((await handler(new Request('https://project.test',{method:'POST',headers:{origin:'https://evil.test'},body:'{}'}))).status,403);
 assert.equal((await handler(new Request('https://project.test',{method:'OPTIONS',headers:{origin}}))).status,204);
 assert.equal((await handler(new Request('https://project.test',{headers:{origin}}))).status,405);
 for(const body of ['not json',{}, {password:5},{password:''}, {password:'a'.repeat(1025)}])assert.equal((await handler(request(body))).status,400);
 assert.equal((await handler(request('a'.repeat(5000)))).status,413);
});
