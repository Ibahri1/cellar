import {collection,doc,getDocFromServer,getDocsFromServer,query,where,runTransaction,serverTimestamp,orderBy,limit,startAfter,type DocumentData,type Firestore,type Transaction,type QueryDocumentSnapshot} from 'firebase/firestore';
import {type Layout,previewRestore,restoreSteps} from './layout.ts';
export const stateRef=(db:Firestore)=>doc(db,'cellarState','current');
const fail=(message:string):never=>{throw Object.assign(Error(message),{code:'failed-precondition'});};
/** Lazy, non-destructive bootstrap. The transaction verifies every queried
 * bottle and the coordination revision before publishing the initial layout. */
export async function ensureLayout(db:Firestore){
 if((await getDocFromServer(stateRef(db))).exists())return;
 const active=await getDocsFromServer(query(collection(db,'bottles'),where('status','==','In Cellar')));
 await runTransaction(db,async tx=>{if((await tx.get(stateRef(db))).exists())return;const records=await Promise.all(active.docs.map(d=>tx.get(d.ref)));const layout:Layout={};for(const record of records){const b=record.data();if(b?.status==='In Cellar')layout[record.id]=b.locationKey;}
 tx.set(stateRef(db),{revision:0,layout,lock:null,changeIds:[],updatedAt:serverTimestamp()});});
}
export async function prepareChange(tx:Transaction,db:Firestore,restoreId?:string){const state=(await tx.get(stateRef(db))).data()!;if(!state)fail('Cellar layout has not been initialized.');if(state.lock&&state.lock!==restoreId)throw Object.assign(Error('Resume the active restore in Cellar History.'),{code:'cellar-locked'});const groupId=`auto_${Math.floor(Date.now()/300000)}`,groupRef=doc(db,'cellarSnapshots',groupId),group=await tx.get(groupRef);return {state,groupId,groupRef,group};}
export function commitChange(tx:Transaction,db:Firestore,prepared:Awaited<ReturnType<typeof prepareChange>>,id:string,layout:Layout,ids:string[],occupancy:boolean){
 const {state,groupId,groupRef,group}=prepared,revision=state.revision+1;
 tx.set(stateRef(db),{...state,layout,revision,changeIds:ids,lastChangeId:id,updatedAt:serverTimestamp()});
 if(!occupancy)return;
 // The immutable base plus immutable revision deltas form ONE logical snapshot
 // per fixed five-minute window. No browser timer or later flush is required.
 if(!group.exists())tx.set(groupRef,{id:groupId,name:'Automatic cellar layout',type:'Automatic',schemaVersion:1,layout,revision,createdAt:serverTimestamp()});
 tx.set(doc(db,'cellarChanges',id),{id,groupId,revision,changes:Object.fromEntries(ids.map(key=>[key,layout[key]??null])),createdAt:serverTimestamp()});
}
export type SavedLayout={id:string;name:string;type:string;schemaVersion:number;layout:Layout;revision:number;createdAt:{toDate:()=>Date}};
export async function saveLayout(db:Firestore,name:string,type='Manual',id:string=crypto.randomUUID()){
 await ensureLayout(db);if(!name.trim()||name.trim().length>160)throw Error('Enter a snapshot name of up to 160 characters.');
 await runTransaction(db,async tx=>{const existing=await tx.get(doc(db,'cellarSnapshots',id));if(existing.exists())return;const state=(await tx.get(stateRef(db))).data()!;if(state.lock)fail('Finish the active restoration before saving another layout.');tx.set(doc(db,'cellarSnapshots',id),{id,name:name.trim(),type,schemaVersion:1,layout:state.layout,revision:state.revision,createdAt:serverTimestamp()});});return id;
}
export async function readLayout(db:Firestore,snapshot:SavedLayout){if(snapshot.type!=='Automatic')return snapshot.layout;const events=await getDocsFromServer(query(collection(db,'cellarChanges'),where('groupId','==',snapshot.id)));const layout={...snapshot.layout};for(const event of events.docs.map(d=>d.data()).filter(e=>e.revision>snapshot.revision).sort((a,b)=>a.revision-b.revision))for(const [id,to] of Object.entries(event.changes)){if(to===null)delete layout[id];else layout[id]=to as string;}return layout;}
export async function listLayouts(db:Firestore,cursor?:QueryDocumentSnapshot<DocumentData>){const page=await getDocsFromServer(query(collection(db,'cellarSnapshots'),orderBy('createdAt','desc'),...(cursor?[startAfter(cursor)]:[]),limit(20)));return {items:page.docs.map(d=>d.data() as SavedLayout),cursor:page.docs.at(-1),more:page.size===20};}
export async function currentLayout(db:Firestore){await ensureLayout(db);return (await getDocFromServer(stateRef(db))).data()!;}
/** Safety backup is a separate, committed immutable snapshot. Acquisition of
 * the restore lock rechecks its exact revision, otherwise nothing is moved. */
export async function beginRestore(db:Firestore,saved:Layout,expectedRevision:number,id:string){
 const state=await currentLayout(db);if(state.lock)fail('Resume the active restoration first.');if(state.revision!==expectedRevision)fail('Inventory changed. Preview this snapshot again.');const preview=previewRestore(saved,state.layout);if(preview.conflicts.length)throw Error(preview.conflicts.join('\n'));const steps=restoreSteps(saved,state.layout);if(!steps.length)throw Error('No position changes are needed.');
 const safetyId=`safety_${id}`;await saveLayout(db,`Before Restore — ${new Date().toLocaleString()}`,'Safety',safetyId);
 await runTransaction(db,async tx=>{const job=await tx.get(doc(db,'cellarRestores',id));if(job.exists())return;const current=(await tx.get(stateRef(db))).data()!,safety=(await tx.get(doc(db,'cellarSnapshots',safetyId))).data();if(current.lock||current.revision!==expectedRevision||safety?.revision!==expectedRevision)fail('Inventory changed before the restore lock. Preview again.');tx.set(doc(db,'cellarRestores',id),{id,safetyId,steps,index:0,status:'Running',createdAt:serverTimestamp(),updatedAt:serverTimestamp()});tx.update(stateRef(db),{lock:id,updatedAt:serverTimestamp()});});return id;
}
