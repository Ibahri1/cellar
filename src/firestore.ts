import {collection,doc,getDocFromServer,getCountFromServer,query,where,runTransaction,serverTimestamp,type DocumentData,type Firestore,type Timestamp} from 'firebase/firestore';
import {locationLabel,type Activity,type Bottle,type Placement,type Wine} from './domain.ts';
import {validPhotoData} from './photos.ts';
import {ensureLayout,prepareChange,commitChange,stateRef} from './cellar-history.ts';
import {placement} from './layout.ts';
export type Mutation={action:string;payload:Record<string,unknown>;requestId:string};
// Three bottles fit the rules' 20-access-call atomic-operation budget. This is
// a per-save transport limit, NOT a limit on total BOTTOM inventory.
export const MAX_ADD_BATCH=3;
export const activeQuery=(db:Firestore)=>query(collection(db,'bottles'),where('status','==','In Cellar'));
const date=(t:Timestamp|null)=>t?.toDate().toISOString()??null;
export function decodeWine(d:DocumentData):Wine{return {id:d.id,name:d.name,producer:d.producer,vintage:d.vintage,wine_type:d.wineType,country:d.country,region:d.region,grape_variety:d.grapeVariety,bottle_size:d.bottleSize,tasting_notes:d.tastingNotes,image_url:d.imageUrl??null,preset_id:d.presetId??d.id,created_at:date(d.createdAt)??''};}
export function decodeBottle(d:DocumentData,wine:Wine):Bottle{return {id:d.id,wine_id:d.wineId,wine,location_type:d.locationType,row_number:d.row,column_number:d.column,depth_number:d.depth,status:d.status,personal_rating:d.personalRating,personal_notes:d.personalNotes,version:d.version,created_at:date(d.createdAt)!,removed_at:date(d.removedAt),price_cents:d.priceCents??null,photo_id:d.photoId??null,purchased_from:d.purchasedFrom??'',preset_id:d.presetId??d.wineId};}
export function decodeActivity(d:DocumentData):Activity{return {id:d.id,bottle_id:d.bottleId,wine_name:d.wineName,vintage:d.vintage,action:d.action,previous_location:d.previousLocation,new_location:d.newLocation,created_at:date(d.createdAt)!};}
function fail(code:string,message:string):never{throw Object.assign(Error(message),{code});}
function validText(v:unknown,max:number,required=false){return typeof v==='string'&&v.length<=max&&(!required||v.trim().length>0);}
function year(v:unknown){return v===null||(Number.isInteger(v)&&Number(v)>=1&&Number(v)<=9999);}
export function encodeWine(w:Wine,id:string){
 if(!w||!validText(w.name,200,true)||!validText(w.producer,200)||!validText(w.wine_type,160,true)||!year(w.vintage)||!validText(w.country,160)||!validText(w.region,160)||!validText(w.grape_variety,200)||!Number.isInteger(w.bottle_size)||w.bottle_size<50||w.bottle_size>18000||!validText(w.tasting_notes,10000)||!(w.image_url===null||(validText(w.image_url,2048)&&w.image_url.startsWith('https://'))))fail('invalid-argument','Check the wine details.');
 return {id,name:w.name.trim(),producer:w.producer,vintage:w.vintage,wineType:w.wine_type.trim(),country:w.country,region:w.region,grapeVariety:w.grape_variety,bottleSize:w.bottle_size,tastingNotes:w.tasting_notes,imageUrl:w.image_url,createdAt:serverTimestamp()};
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
 const presetId=data.presetId??data.wineId,preset=(await getDocFromServer(doc(db,'winePresets',presetId))).data();
 return decodeBottle(data,{...wine,preset_id:presetId,default_price_cents:preset?.defaultPriceCents??null,shared_photo_id:preset?.photoId??null,preset_configured:preset?.photoConfigured??false});
}
export async function removalTotals(db:Firestore){const [drank,gifted]=await Promise.all(['Drank','Gifted'].map(status=>getCountFromServer(query(collection(db,'outcomes'),where('status','==',status)))));return {drank:drank.data().count,gifted:gifted.data().count};}

export async function saveMutation(db:Firestore,operation:Mutation){
 const {action,payload,requestId}=operation;
 if(!/^[a-zA-Z0-9-]{16,80}$/.test(requestId)||!['add','edit','move','swap','restore','Drank','Gifted'].includes(action))fail('invalid-argument','Invalid inventory operation.');
 const places=action==='add'?payload.placements as Placement[]:[];
 if(action==='add'&&(!Array.isArray(places)||!places.length||places.length>MAX_ADD_BATCH))fail('invalid-argument',`Add up to ${MAX_ADD_BATCH} bottles per save.`);
 const locations=places.map(encodeLocation);if(new Set(locations.filter(p=>p.locationType==='RACK').map(p=>p.locationKey)).size!==locations.filter(p=>p.locationType==='RACK').length)fail('already-exists','Each bottle needs a unique position.');
 const personalNotes=payload.personal_notes??'',personalRating=payload.personal_rating??null,priceCents=payload.price_cents,photoData=payload.photo_data,purchasedFrom=payload.purchased_from;
 if(priceCents!==undefined&&priceCents!==null&&(!Number.isSafeInteger(priceCents)||Number(priceCents)<0))fail('invalid-argument','Enter a valid price.');
 if(purchasedFrom!==undefined&&!validText(purchasedFrom,200))fail('invalid-argument','Purchased From must be at most 200 characters.');
 if(photoData!==undefined&&photoData!==null&&!validPhotoData(photoData))fail('invalid-argument','Choose a compressed JPEG thumbnail.');
 if(['add','edit'].includes(action)&&(!validText(personalNotes,10000)||!(personalRating===null||(Number.isInteger(personalRating)&&Number(personalRating)>=1&&Number(personalRating)<=5))))fail('invalid-argument','Check personal notes and rating.');
 const hash=await requestHash(operation),size=action==='add'?places.length:action==='swap'?2:1;
 const histories=Array.from({length:size},(_,i)=>doc(db,'activityHistory',`${requestId}_${i}`));
 await ensureLayout(db);
 return runTransaction(db,async tx=>{
  const prior=await Promise.all(histories.map(ref=>tx.get(ref)));if(prior.every(s=>s.exists())){if(prior.some(s=>s.data()!.requestHash!==hash))fail('invalid-argument','Save identifier already used.');return;}if(prior.some(s=>s.exists()))fail('failed-precondition','Incomplete request.');
  const prepared=await prepareChange(tx,db,action==='restore'?String(payload.restore_id):undefined);
  const jobRef=action==='restore'?doc(db,'cellarRestores',String(payload.restore_id)):null;
  const job=jobRef?(await tx.get(jobRef)).data():null;
  if(action==='restore'&&(!job||job.status!=='Running'||job.index!==payload.step||prepared.state.lock!==job.id))fail('aborted','Restore step changed. Resume from Cellar History.');
  const step=job?.steps[job.index];
  const refs=action==='add'?Array.from({length:size},(_,i)=>doc(db,'bottles',`${requestId}_${i}`)):[doc(db,'bottles',action==='restore'?step.id:String(payload.id)),...(action==='swap'?[doc(db,'bottles',String(payload.other_id))]:[])];
  const beforeSnapshots=await Promise.all(refs.map(ref=>tx.get(ref))),before=beforeSnapshots.map(s=>s.data());
  if(action==='add'){if(before.some(Boolean))fail('already-exists','Bottle identifier already exists.');}else{
   if(!before.every(Boolean))fail('not-found','Bottle no longer exists.');
   if(action!=='restore'&&(before[0]!.version!==payload.version||action==='swap'&&before[1]!.version!==payload.other_version))fail('aborted','This bottle changed on another device.');
   if(action!=='edit'&&before.some(b=>b!.status!=='In Cellar'))fail('failed-precondition','Bottle has already left the cellar.');
   if(action==='swap'&&(refs[0].id===refs[1].id||before[0]!.locationKey===before[1]!.locationKey))fail('invalid-argument','Choose two bottles in different locations.');
  }
  const wineId=action==='add'&&typeof payload.wine_id==='string'?payload.wine_id:['add','edit'].includes(action)?`${requestId}_wine`:before[0]!.wineId;
  const newWine=['add','edit'].includes(action)&&!(action==='add'&&payload.wine_id)?encodeWine(payload.wine as Wine,wineId):null;
  const wineRef=doc(db,'wines',wineId),wine=newWine??(await tx.get(wineRef)).data();if(!wine)fail('not-found','Wine details missing.');
  const otherWine=action==='swap'?(await tx.get(doc(db,'wines',before[1]!.wineId))).data():null;
  const presetId=action==='add'?String(payload.preset_id??wineId):before[0]?.presetId??before[0]?.wineId;
  const presetRef=['add','edit'].includes(action)?doc(db,'winePresets',presetId):null;
  const preset=presetRef?(await tx.get(presetRef)).data():null;
  const photoRef=photoData?doc(db,'photos',`${requestId}_photo`):null;
  const targets=action==='add'?locations:action==='move'?[encodeLocation(payload.location as Placement)]:action==='restore'?[encodeLocation(placement(step.to))]:action==='swap'?before.map((_,i)=>({locationType:before[1-i]!.locationType,locationKey:before[1-i]!.locationKey,row:before[1-i]!.row,column:before[1-i]!.column,depth:before[1-i]!.depth})):[];
  const reserved=await Promise.all(targets.filter(p=>p.locationType==='RACK').map(p=>tx.get(doc(db,'positions',p.locationKey))));
  if(reserved.some(s=>s.exists()&&!(action==='swap'&&refs.some(ref=>ref.id===s.data()!.bottleId))))fail('already-exists','Destination is occupied.');
  if(['move','restore'].includes(action)&&targets[0].locationKey===before[0]!.locationKey)fail('invalid-argument','Choose another position.');
  if(newWine)tx.set(wineRef,{...newWine,presetId});
  if(photoRef)tx.set(photoRef,{id:photoRef.id,dataUrl:photoData,createdAt:serverTimestamp()});
  if(presetRef){
   const nextPreset={id:presetId,defaultPriceCents:preset?.defaultPriceCents??null,photoId:preset?.photoId??null,photoConfigured:preset?.photoConfigured??false,updatedAt:serverTimestamp()};
   if(action==='add'&&priceCents!==undefined)nextPreset.defaultPriceCents=priceCents;
   if(photoData!==undefined){nextPreset.photoId=photoRef?.id??null;nextPreset.photoConfigured=true;}
   if(!preset||photoData!==undefined||action==='add'&&priceCents!==undefined)tx.set(presetRef,nextPreset);
  }
  const layout={...prepared.state.layout};
  // Delete sources first; final reservations are written once, so swaps never
  // overwrite a source with a later delete in the same atomic transaction.
  if(['move','swap','restore','Drank','Gifted'].includes(action))for(const old of before)if(old?.locationType==='RACK')tx.delete(doc(db,'positions',old.locationKey));
  for(let i=0;i<size;i++){
   const old=before[i],id=refs[i].id,location=targets[i],removed=action==='Drank'||action==='Gifted';
   const next:DocumentData=action==='add'?{id,wineId,presetId,...location,status:'In Cellar',personalRating,personalNotes,version:1,createdAt:serverTimestamp(),removedAt:null,updatedAt:serverTimestamp(),lastActivityId:histories[i].id}:{...old,version:old!.version+1,updatedAt:serverTimestamp(),lastActivityId:histories[i].id,...(action==='edit'?{wineId,presetId,personalRating,personalNotes}:{}),...(location??{}),...(removed?{status:action,removedAt:serverTimestamp()}:{})};
   if(['add','edit'].includes(action)){if(priceCents!==undefined||action==='add')next.priceCents=priceCents??null;if(purchasedFrom!==undefined)next.purchasedFrom=(purchasedFrom as string).trim();if(photoRef)next.photoId=photoRef.id;else if(photoData===null||action==='add')next.photoId=null;}
   if(location?.locationType==='RACK')tx.set(doc(db,'positions',location.locationKey),{id:location.locationKey,bottleId:id});
   tx.set(refs[i],next);if(next.status==='In Cellar')layout[id]=next.locationKey;else delete layout[id];
   const w=action==='swap'&&i===1?otherWine!:wine;
   tx.set(histories[i],{id:histories[i].id,bottleId:id,wineId:next.wineId,wineName:w.name,vintage:w.vintage,action:action==='add'?'Added':action==='edit'?'Edited':action==='swap'?'Swapped':action==='restore'?'Restored':action==='move'?'Moved':action,previousLocation:old?.status==='In Cellar'?old.locationKey:null,newLocation:next.status==='In Cellar'?next.locationKey:null,bottleVersion:next.version,requestHash:hash,createdAt:serverTimestamp()});
   if(removed)tx.set(doc(db,'outcomes',id),{id,bottleId:id,status:action,removedAt:serverTimestamp()});
  }
  commitChange(tx,db,prepared,requestId,layout,refs.map(ref=>ref.id),action!=='edit');
  if(jobRef&&job){const index=job.index+1;tx.update(jobRef,{index,status:index===job.steps.length?'Complete':'Running',updatedAt:serverTimestamp()});if(index===job.steps.length)tx.update(stateRef(db),{lock:null});}
 });
}
