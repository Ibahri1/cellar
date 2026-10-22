import {prepareChange,commitChange} from '../src/cellar-history.ts';
// LOCAL EMULATORS ONLY. No live Firebase project or real credentials are used.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {initializeApp,deleteApp} from 'firebase/app';
import {initializeAuth,inMemoryPersistence,connectAuthEmulator,createUserWithEmailAndPassword,signOut} from 'firebase/auth';
import {doc,collection,getDoc,getDocs,query,where,orderBy,documentId,limit,startAfter,setDoc,deleteDoc,updateDoc,writeBatch,runTransaction,serverTimestamp,setLogLevel,onSnapshot} from 'firebase/firestore';
import {saveMutation,loadBottle,removalTotals,activeQuery,MAX_ADD_BATCH} from '../src/firestore.ts';
import {authenticateAdmin} from '../src/auth.ts';
import {allRackPositions,bottom} from '../src/domain.ts';
import {encodeWine} from '../src/firestore.ts';

const projectId='demo-private-cellar';
let env,db,other,unauth,auth,app,uid;
const email='local-fixture@example.test',password='LOCAL-EMULATOR-FIXTURE-ONLY';
const wine={id:'test-fixture',name:'TEST FIXTURE Cabernet',producer:'TEST FIXTURE Producer',vintage:2020,wine_type:'Red',country:'France',region:'Test region',grape_variety:'Cabernet Sauvignon',bottle_size:750,tasting_notes:'',image_url:null,drinking_window_start:null,drinking_window_end:null};
const rack=(r,c,d)=>({location_type:'RACK',row_number:r,column_number:c,depth_number:d});
const add=(placements,extra={})=>({action:'add',payload:{wine,placements,personal_notes:'',personal_rating:null,...extra},requestId:randomUUID()});
const mutate=(action,bottle,extra={})=>({action,payload:{id:bottle.id,version:bottle.version,...extra},requestId:randomUUID()});
const raw=async id=>(await getDoc(doc(db,'bottles',id))).data();

before(async()=>{
 assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8080','Run npm run test:rules; never use a live database for these tests.');
 assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST,'127.0.0.1:9099');
 setLogLevel('silent');
 app=initializeApp({projectId,apiKey:'emulator-only-public-key',appId:'emulator-fixture'},'auth-test');
 auth=initializeAuth(app,{persistence:inMemoryPersistence});connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});
 uid=(await createUserWithEmailAndPassword(auth,email,password)).user.uid;await signOut(auth);
 const source=await readFile(new URL('../firestore.rules',import.meta.url),'utf8');
 const owner=/request\.auth\.uid\s*==\s*'[^']+'/g;
 assert.equal([...source.matchAll(owner)].length,1,'Rules must contain exactly one explicit administrator UID restriction.');
 // Only the in-memory emulator copy uses the generated test account. The
 // configured real administrator UID in firestore.rules is never modified.
 const rules=source.replace(owner,`request.auth.uid == '${uid}'`);
 env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8080,rules}});
 await env.clearFirestore();db=env.authenticatedContext(uid).firestore();other=env.authenticatedContext('another-user').firestore();unauth=env.unauthenticatedContext().firestore();
});
after(async()=>{await env?.cleanup();if(app)await deleteApp(app);});

test('Firebase Authentication and Firestore rules/transactions',async t=>{
 let first,second,third;
 await t.test('correct password, incorrect password, wrong UID and logout',async()=>{
  assert.equal((await authenticateAdmin(auth,email,password,uid)).uid,uid);await signOut(auth);assert.equal(auth.currentUser,null);
  await assert.rejects(authenticateAdmin(auth,email,'WRONG-LOCAL-FIXTURE',uid));assert.equal(auth.currentUser,null);
  await assert.rejects(authenticateAdmin(auth,email,password,'wrong-uid'));assert.equal(auth.currentUser,null);
 });
 await t.test('anonymous and unrelated authenticated accounts are denied',async()=>{
  for(const context of [other,unauth]){
   await assertFails(getDocs(collection(context,'bottles')));
   await assertFails(setDoc(doc(context,'wines','unauthorized'),{name:'Unauthorized'}));
   await assertFails(getDocs(collection(context,'activityHistory')));
  }
  await assertFails(setDoc(doc(db,'unknown','document'),{value:1}));
 });
 await t.test('three rack bottles commit atomically with wine, reservations and history',async()=>{
  const op=add([rack(1,1,1),rack(1,1,2),rack(12,5,3)]);await saveMutation(db,op);
  first=await loadBottle(db,`${op.requestId}_0`);second=await loadBottle(db,`${op.requestId}_1`);third=await loadBottle(db,`${op.requestId}_2`);
  assert.equal(first.wine.name,wine.name);assert.equal(third.row_number,12);
  assert.equal((await getDoc(doc(db,'positions','R12-C5-D3'))).data().bottleId,third.id);
  assert.equal((await getDocs(collection(db,'activityHistory'))).size,3);
 });
 await t.test('bottom supports many records without rack coordinates or a total capacity cap',async()=>{
  // More BOTTOM bottles than the entire main rack capacity, in bounded saves.
  for(let i=0;i<61;i++)await saveMutation(db,add([bottom,bottom,bottom]));
  assert.equal((await getDocs(query(collection(db,'bottles'),where('locationType','==','BOTTOM')))).size,183);
  assert.equal((await getDocs(collection(db,'positions'))).size,3);
 });
 await t.test('idempotent retries do not duplicate bottles or history',async()=>{
  const op=add([bottom]);await saveMutation(db,op);await saveMutation(db,op);
  assert.equal((await getDocs(query(collection(db,'bottles'),where('id','==',`${op.requestId}_0`)))).size,1);
  await assert.rejects(saveMutation(db,{...op,payload:{...op.payload,personal_notes:'changed'}}));
 });
 await t.test('occupied locations reject the entire addition, including any bottom bottles',async()=>{
  const op=add([bottom,rack(1,1,1)]);await assert.rejects(saveMutation(db,op));
  assert.equal((await getDoc(doc(db,'bottles',`${op.requestId}_0`))).exists(),false);
  assert.equal((await getDoc(doc(db,'wines',`${op.requestId}_wine`))).exists(),false);
 });
 await t.test('concurrent clients cannot reserve the same location',async()=>{
  const device=env.authenticatedContext(uid).firestore();
  const results=await Promise.allSettled([saveMutation(db,add([rack(2,2,2)])),saveMutation(device,add([rack(2,2,2)]))]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await getDocs(query(collection(db,'bottles'),where('locationKey','==','R2-C2-D2')))).size,1);
 });
 await t.test('edit is versioned and does not change another bottle or its old history',async()=>{
  await saveMutation(db,mutate('edit',first,{wine:{...wine,name:'TEST FIXTURE Edited'},personal_notes:'Updated',personal_rating:5}));
  await assert.rejects(saveMutation(db,mutate('edit',first,{wine,personal_notes:'Stale',personal_rating:null})),/changed on another device/);
  first=await loadBottle(db,first.id);assert.equal(first.wine.name,'TEST FIXTURE Edited');assert.equal(first.version,2);
  assert.equal((await loadBottle(db,second.id)).wine.name,wine.name);
  assert.equal((await getDoc(doc(db,'activityHistory',first.id))).data().wineName,wine.name);
 });
 await t.test('move rack to bottom, bottom to rack, and rack to rack releases reservations',async()=>{
  await saveMutation(db,mutate('move',first,{location:bottom}));first=await loadBottle(db,first.id);
  assert.equal((await getDoc(doc(db,'positions','R1-C1-D1'))).exists(),false);
  await saveMutation(db,mutate('move',first,{location:rack(3,3,3)}));first=await loadBottle(db,first.id);
  await saveMutation(db,mutate('move',first,{location:rack(4,4,1)}));first=await loadBottle(db,first.id);
  assert.equal((await getDoc(doc(db,'positions','R3-C3-D3'))).exists(),false);assert.equal(first.row_number,4);
 });
 await t.test('Drank and Gifted retain dated bottles/history and free positions',async()=>{
  await saveMutation(db,mutate('Drank',first));await saveMutation(db,mutate('Gifted',second));
  first=await loadBottle(db,first.id);second=await loadBottle(db,second.id);
  assert.equal(first.status,'Drank');assert.ok(first.removed_at);assert.equal(second.status,'Gifted');
  assert.equal((await getDoc(doc(db,'positions','R4-C4-D1'))).exists(),false);
  assert.deepEqual(await removalTotals(db),{drank:1,gifted:1});
  await assert.rejects(saveMutation(db,mutate('Drank',first)));await assert.rejects(saveMutation(db,mutate('move',first,{location:bottom})));
 });
 await t.test('rules reject direct status, protected-field, reservation and history tampering',async()=>{
  await assertFails(updateDoc(doc(db,'bottles',third.id),{status:'Invalid'}));
  await assertFails(updateDoc(doc(db,'bottles',third.id),{createdAt:serverTimestamp()}));
  await assertFails(updateDoc(doc(db,'bottles',third.id),{personalNotes:'Bypass history'}));
  await assertFails(deleteDoc(doc(db,'positions','R12-C5-D3')));
  await assertFails(setDoc(doc(db,'positions','R12-C5-D3'),{id:'R12-C5-D3',bottleId:'fake-bottle'}));
  await assertFails(updateDoc(doc(db,'activityHistory',third.id),{action:'Gifted'}));
  await assertFails(deleteDoc(doc(db,'bottles',third.id)));
  await assertFails(setDoc(doc(db,'outcomes',third.id),{id:third.id,bottleId:third.id,status:'Drank',removedAt:serverTimestamp()}));
  await assertFails(updateDoc(doc(db,'wines',third.wine_id),{name:'Rewrite all bottles'}));
 });
 await t.test('rules reject forged bottles even with plausible history and reservation documents',async()=>{
  const original=await raw(third.id);
  async function forge({location,omitHistory=false,omitReservation=false}){
   const id=randomUUID();const h={id,bottleId:id,wineId:original.wineId,wineName:wine.name,vintage:wine.vintage,action:'Added',previousLocation:null,newLocation:location.locationKey,bottleVersion:1,requestHash:'a'.repeat(64),createdAt:serverTimestamp()};
   const batch=writeBatch(db);batch.set(doc(db,'bottles',id),{...original,id,...location,version:1,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),lastActivityId:id});
   if(!omitHistory)batch.set(doc(db,'activityHistory',id),h);
   if(!omitReservation)batch.set(doc(db,'positions',location.locationKey),{id:location.locationKey,bottleId:id});
   await assertFails(batch.commit());
  }
  await forge({location:{locationType:'RACK',row:5,column:5,depth:1,locationKey:'R5-C5-D1'},omitHistory:true});
  await forge({location:{locationType:'RACK',row:5,column:5,depth:1,locationKey:'R5-C5-D1'},omitReservation:true});
  await forge({location:{locationType:'RACK',row:13,column:1,depth:1,locationKey:'R13-C1-D1'}});
  await forge({location:{locationType:'RACK',row:5,column:1,depth:1,locationKey:'R5-C2-D1'}});
 });
 await t.test('shared collection listeners receive committed changes from another client',async()=>{
  const id=randomUUID(),device=env.authenticatedContext(uid).firestore();let stop;
  const observed=new Promise((resolve,reject)=>{const timer=setTimeout(()=>{stop?.();reject(Error('Listener timed out'));},10000);stop=onSnapshot(activeQuery(db),snapshot=>{if(!snapshot.metadata.hasPendingWrites&&snapshot.docs.some(d=>d.id===`${id}_0`)){clearTimeout(timer);stop();resolve();}},reject);});
  await saveMutation(device,{...add([bottom]),requestId:id});await observed;
 });
 await t.test('history pagination retains stable ordering for same-time multi-bottle saves',async()=>{
  const base=query(collection(db,'activityHistory'),orderBy('createdAt','desc'),orderBy(documentId(),'desc'),limit(50));
  const one=await getDocs(base),two=await getDocs(query(base,startAfter(one.docs.at(-1))));
  assert.equal(one.size,50);assert.equal(two.size,50);assert.equal(new Set([...one.docs,...two.docs].map(d=>d.id)).size,100);
  assert.ok((await getDocs(query(collection(db,'activityHistory'),where('action','==','Moved'),orderBy('createdAt','desc'),orderBy(documentId(),'desc'),limit(50)))).size>=3);
 });
 await t.test('settings schema and per-save bounds are validated',async()=>{
  await setDoc(doc(db,'settings','cellar'),{rackRows:12,rackColumns:5,rackDepth:3,rackCapacity:180});
  await assertFails(updateDoc(doc(db,'settings','cellar'),{rackCapacity:181}));
  await assert.rejects(saveMutation(db,add(Array.from({length:MAX_ADD_BATCH+1},()=>bottom))));
 });
 await t.test('USD cents, custom types and private thumbnails persist through edit, move and removal',async()=>{
  const photo='data:image/jpeg;base64,'+(await readFile(new URL('./fixtures/test-bottle.jpg',import.meta.url))).toString('base64');
  const op=add([bottom],{wine:{...wine,wine_type:'  My Custom Red Blend  '},price_cents:1999,photo_data:photo});await saveMutation(db,op);
  let bottle=await loadBottle(db,`${op.requestId}_0`);assert.equal(bottle.price_cents,1999);assert.equal(bottle.wine.wine_type,'My Custom Red Blend');
  const photoId=bottle.photo_id;const device=env.authenticatedContext(uid).firestore();assert.equal((await getDoc(doc(device,'photos',photoId))).data().dataUrl,photo);
  for(const context of [unauth,other])await assertFails(getDoc(doc(context,'photos',photoId)));
  await saveMutation(db,mutate('edit',bottle,{wine:bottle.wine,personal_notes:'Price edit',personal_rating:4,price_cents:7500}));bottle=await loadBottle(device,bottle.id);assert.equal(bottle.price_cents,7500);assert.equal(bottle.photo_id,photoId);
  await saveMutation(db,mutate('move',bottle,{location:rack(6,2,3)}));bottle=await loadBottle(db,bottle.id);assert.equal(bottle.price_cents,7500);assert.equal(bottle.photo_id,photoId);
  await saveMutation(db,mutate('Drank',bottle));bottle=await loadBottle(db,bottle.id);assert.equal(bottle.price_cents,7500);assert.equal(bottle.photo_id,photoId);
  await saveMutation(db,mutate('edit',bottle,{wine:bottle.wine,personal_notes:'Replace photo',personal_rating:4,price_cents:25050,photo_data:photo}));bottle=await loadBottle(db,bottle.id);assert.notEqual(bottle.photo_id,photoId);assert.equal(bottle.price_cents,25050);
  await saveMutation(db,mutate('edit',bottle,{wine:bottle.wine,personal_notes:'Remove photo and price',personal_rating:4,price_cents:null,photo_data:null}));bottle=await loadBottle(db,bottle.id);assert.equal(bottle.photo_id,null);assert.equal(bottle.price_cents,null);
 });
 await t.test('legacy documents with windows and no price remain readable and editable without a reset',async()=>{
  const legacyWine={...encodeWine(wine,'legacy-wine'),drinkingWindowStart:2022,drinkingWindowEnd:2030};
  const legacy={...await raw(third.id),id:'legacy-bottle',wineId:'legacy-wine',locationType:'BOTTOM',locationKey:'BOTTOM',row:null,column:null,depth:null,lastActivityId:'legacy-history'};delete legacy.priceCents;delete legacy.photoId;
  await env.withSecurityRulesDisabled(async context=>{await setDoc(doc(context.firestore(),'wines','legacy-wine'),legacyWine);await setDoc(doc(context.firestore(),'bottles','legacy-bottle'),legacy);});
  let bottle=await loadBottle(db,'legacy-bottle');assert.equal(bottle.price_cents,null);assert.equal(bottle.wine.drinking_window_start,undefined);
  await saveMutation(db,mutate('edit',bottle,{wine:{...bottle.wine,wine_type:'Champagne'},personal_notes:'Legacy edit',personal_rating:null,price_cents:0}));bottle=await loadBottle(db,'legacy-bottle');assert.equal(bottle.price_cents,0);
  assert.equal((await getDoc(doc(db,'wines','legacy-wine'))).data().drinkingWindowStart,2022);
  assert.equal((await getDoc(doc(db,'wines',bottle.wine_id))).data().drinkingWindowStart,undefined);
 });
 await t.test('rules reject fractional/negative prices, oversized photos and unsupported photo formats',async()=>{
  const original=await raw(third.id),savedWine=(await getDoc(doc(db,'wines',original.wineId))).data();
  async function priceEdit(price){
   const id=randomUUID();return runTransaction(db,async batch=>{const prepared=await prepareChange(batch,db);
   batch.update(doc(db,'bottles',third.id),{priceCents:price,version:original.version+1,updatedAt:serverTimestamp(),lastActivityId:id});
   batch.set(doc(db,'activityHistory',id),{id,bottleId:third.id,wineId:original.wineId,wineName:savedWine.name,vintage:savedWine.vintage,action:'Edited',previousLocation:original.locationKey,newLocation:original.locationKey,bottleVersion:original.version+1,requestHash:'a'.repeat(64),createdAt:serverTimestamp()});
   commitChange(batch,db,prepared,id,prepared.state.layout,[third.id],false);});
  }
  for(const price of [-1,19.99,9007199254740992])await assertFails(priceEdit(price));
  await priceEdit(1999);assert.equal((await loadBottle(db,third.id)).price_cents,1999);
  for(const dataUrl of ['data:image/svg+xml,<svg/>','data:image/jpeg;base64,/9j/'+'A'.repeat(110000)]){const id=randomUUID();await assertFails(setDoc(doc(db,'photos',id),{id,dataUrl,createdAt:serverTimestamp()}));}
  await assertFails(setDoc(doc(db,'wines','blank-type'),{...encodeWine(wine,'blank-type'),wineType:'  '}));
 });
});
