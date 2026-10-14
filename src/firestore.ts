import {collection,doc,getDocFromServer,getCountFromServer,query,where,runTransaction,serverTimestamp,type DocumentData,type Firestore,type Timestamp} from 'firebase/firestore';
import {locationLabel,wineTypes,type Activity,type Bottle,type Placement,type Wine} from './domain.ts';
export type Mutation={action:string;payload:Record<string,unknown>;requestId:string};
// Three bottles fit the rules' 20-access-call atomic-operation budget. This is
// a per-save transport limit, NOT a limit on total BOTTOM inventory.
export const MAX_ADD_BATCH=3;
export const activeQuery=(db:Firestore)=>query(collection(db,'bottles'),where('status','==','In Cellar'));
const date=(t:Timestamp|null)=>t?.toDate().toISOString()??null;
export function decodeWine(d:DocumentData):Wine{return {id:d.id,name:d.name,producer:d.producer,vintage:d.vintage,wine_type:d.wineType,country:d.country,region:d.region,grape_variety:d.grapeVariety,bottle_size:d.bottleSize,tasting_notes:d.tastingNotes,image_url:d.imageUrl,drinking_window_start:d.drinkingWindowStart,drinking_window_end:d.drinkingWindowEnd};}
export function decodeBottle(d:DocumentData,wine:Wine):Bottle{return {id:d.id,wine_id:d.wineId,wine,location_type:d.locationType,row_number:d.row,column_number:d.column,depth_number:d.depth,status:d.status,personal_rating:d.personalRating,personal_notes:d.personalNotes,version:d.version,created_at:date(d.createdAt)!,removed_at:date(d.removedAt)};}
export function decodeActivity(d:DocumentData):Activity{return {id:d.id,bottle_id:d.bottleId,wine_name:d.wineName,vintage:d.vintage,action:d.action,previous_location:d.previousLocation,new_location:d.newLocation,created_at:date(d.createdAt)!};}
function fail(code:string,message:string):never{throw Object.assign(Error(message),{code});}
function validText(v:unknown,max:number,required=false){return typeof v==='string'&&v.length<=max&&(!required||v.trim().length>0);}
function year(v:unknown){return v===null||(Number.isInteger(v)&&Number(v)>=1&&Number(v)<=9999);}
export function encodeWine(w:Wine,id:string){
 if(!w||!validText(w.name,200,true)||!validText(w.producer,200)||!wineTypes.includes(w.wine_type as typeof wineTypes[number])||!year(w.vintage)||!validText(w.country,160)||!validText(w.region,160)||!validText(w.grape_variety,200)||!Number.isInteger(w.bottle_size)||w.bottle_size<50||w.bottle_size>18000||!validText(w.tasting_notes,10000)||!(w.image_url===null||(validText(w.image_url,2048)&&w.image_url.startsWith('https://')))||!year(w.drinking_window_start)||!year(w.drinking_window_end)||(w.drinking_window_start!==null&&w.drinking_window_end!==null&&w.drinking_window_start>w.drinking_window_end))fail('invalid-argument','Check the wine details.');
 return {id,name:w.name.trim(),producer:w.producer,vintage:w.vintage,wineType:w.wine_type,country:w.country,region:w.region,grapeVariety:w.grape_variety,bottleSize:w.bottle_size,tastingNotes:w.tasting_notes,imageUrl:w.image_url,drinkingWindowStart:w.drinking_window_start,drinkingWindowEnd:w.drinking_window_end,createdAt:serverTimestamp()};
}
function encodeLocation(p:Placement){
 if(!p||(p.location_type!=='RACK'&&p.location_type!=='BOTTOM'))fail('invalid-argument','Choose a storage location.');
 if(p.location_type==='RACK'&&(!Number.isInteger(p.row_number)||p.row_number!<1||p.row_number!>12||!Number.isInteger(p.column_number)||p.column_number!<1||p.column_number!>5||!Number.isInteger(p.depth_number)||p.depth_number!<1||p.depth_number!>3))fail('invalid-argument','Choose a valid rack position.');
 if(p.location_type==='BOTTOM'&&[p.row_number,p.column_number,p.depth_number].some(n=>n!==null))fail('invalid-argument','Bottom storage does not use rack coordinates.');
 return {locationType:p.location_type,row:p.row_number,column:p.column_number,depth:p.depth_number,locationKey:locationLabel(p)};
}
async function requestHash(operation:Mutation){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([operation.action,operation.payload])));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');}
export async function loadBottle(db:Firestore,id:string,cache=new Map<string,Wine>()){
 const snapshot=await getDocFromServer(doc(db,'bottles',id));if(!snapshot.exists())return null;
 const data=snapshot.data();let wine=cache.get(data.wineId);
 if(!wine){const source=await getDocFromServer(doc(db,'wines',data.wineId));if(!source.exists())fail('failed-precondition','Wine details are missing.');wine=decodeWine(source.data());cache.set(wine.id,wine);}
 return decodeBottle(data,wine);
}
export async function removalTotals(db:Firestore){const [drank,gifted]=await Promise.all(['Drank','Gifted'].map(status=>getCountFromServer(query(collection(db,'outcomes'),where('status','==',status)))));return {drank:drank.data().count,gifted:gifted.data().count};}

export async function saveMutation(db:Firestore,operation:Mutation){
 const {action,payload,requestId}=operation;
 if(!/^[a-zA-Z0-9-]{16,80}$/.test(requestId)||!['add','edit','move','Drank','Gifted'].includes(action))fail('invalid-argument','Invalid inventory operation.');
 const places=action==='add'?payload.placements as Placement[]:[];
 if(action==='add'&&(!Array.isArray(places)||places.length<1||places.length>MAX_ADD_BATCH))fail('invalid-argument',`Add up to ${MAX_ADD_BATCH} bottles per save. Bottom storage has no total capacity limit.`);
 const locations=places.map(encodeLocation);
 if(new Set(locations.filter(p=>p.locationType==='RACK').map(p=>p.locationKey)).size!==locations.filter(p=>p.locationType==='RACK').length)fail('already-exists','Each rack bottle needs a different position.');
 const personalNotes=payload.personal_notes??'',personalRating=payload.personal_rating??null;
 if(['add','edit'].includes(action)&&(!validText(personalNotes,10000)||!(personalRating===null||(Number.isInteger(personalRating)&&Number(personalRating)>=1&&Number(personalRating)<=5))))fail('invalid-argument','Check the personal notes and rating.');
 const hash=await requestHash(operation),size=action==='add'?places.length:1;
 const historyRefs=Array.from({length:size},(_,i)=>doc(db,'activityHistory',`${requestId}_${i}`));
 const wineId=typeof payload.wine_id==='string'&&action==='add'?payload.wine_id:`${requestId}_wine`;
 const newWine=['add','edit'].includes(action)&&!(action==='add'&&typeof payload.wine_id==='string')?encodeWine(payload.wine as Wine,wineId):null;
 return runTransaction(db,async transaction=>{
  // All reads precede writes. Stable IDs make an unconfirmed retry idempotent.
  const histories=await Promise.all(historyRefs.map(ref=>transaction.get(ref)));
  if(histories.every(s=>s.exists())){if(histories.some(s=>s.data()!.requestHash!==hash))fail('invalid-argument','This save identifier was already used.');return;}
  if(histories.some(s=>s.exists()))fail('failed-precondition','An incomplete save needs review. Refresh your collection.');
  const bottleRefs=action==='add'?Array.from({length:size},(_,i)=>doc(db,'bottles',`${requestId}_${i}`)):[doc(db,'bottles',String(payload.id))];
  const beforeSnapshots=await Promise.all(bottleRefs.map(ref=>transaction.get(ref)));
  const before=beforeSnapshots[0].data();
  if(action!=='add'){
   if(!before)fail('not-found','Bottle not found.');
   if(before.version!==payload.version)fail('aborted','This bottle changed on another device. Reopen its latest details.');
   if(before.status!=='In Cellar'&&action!=='edit')fail('failed-precondition','This bottle has already left the cellar.');
  }else if(beforeSnapshots.some(s=>s.exists()))fail('already-exists','Bottle identifiers already exist.');
  const wineRef=doc(db,'wines',['add','edit'].includes(action)?wineId:before!.wineId);
  const wineSnapshot=newWine?null:await transaction.get(wineRef);
  const wine=newWine??wineSnapshot?.data();if(!wine)fail('not-found','Wine details not found.');
  const destination=action==='move'?encodeLocation(payload.location as Placement):null;
  const targets=action==='add'?locations:destination?[destination]:[];
  const rackTargets=targets.filter(p=>p.locationType==='RACK');
  const reservations=await Promise.all(rackTargets.map(p=>transaction.get(doc(db,'positions',p.locationKey))));
  if(reservations.some(s=>s.exists()))fail('already-exists','That rack position is occupied.');
  if(action==='move'&&before!.locationKey===destination!.locationKey)fail('invalid-argument','Choose a different destination.');
  if(newWine)transaction.set(wineRef,newWine);
  for(let i=0;i<size;i++){
   const old=beforeSnapshots[i].data(),id=bottleRefs[i].id;
   const location=action==='add'?locations[i]:action==='move'?destination!:null;
   const removed=action==='Drank'||action==='Gifted';
   const next:DocumentData=action==='add'?{id,wineId,...location,status:'In Cellar',personalRating,personalNotes,version:1,createdAt:serverTimestamp(),removedAt:null,updatedAt:serverTimestamp(),lastActivityId:historyRefs[i].id}:{...old,version:old!.version+1,updatedAt:serverTimestamp(),lastActivityId:historyRefs[i].id,...(action==='edit'?{wineId,personalRating,personalNotes}:{}),...(location??{}),...(removed?{status:action,removedAt:serverTimestamp()}:{})};
   if(old?.status==='In Cellar'&&old.locationType==='RACK'&&(action==='move'||removed))transaction.delete(doc(db,'positions',old.locationKey));
   if(location?.locationType==='RACK')transaction.set(doc(db,'positions',location.locationKey),{id:location.locationKey,bottleId:id});
   transaction.set(bottleRefs[i],next);
   transaction.set(historyRefs[i],{id:historyRefs[i].id,bottleId:id,wineId:next.wineId,wineName:wine.name,vintage:wine.vintage,action:action==='add'?'Added':action==='edit'?'Edited':action==='move'?'Moved':action,previousLocation:old?.status==='In Cellar'?old.locationKey:null,newLocation:next.status==='In Cellar'?next.locationKey:null,bottleVersion:next.version,requestHash:hash,createdAt:serverTimestamp()});
   if(removed)transaction.set(doc(db,'outcomes',id),{id,bottleId:id,status:action,removedAt:serverTimestamp()});
  }
 });
}
