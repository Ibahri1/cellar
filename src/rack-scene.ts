import type {Bottle} from './domain.ts';

export const PHOTO_ZOOM_MS=1950; // Previously 1500ms: 30% slower.
export const PHOTO_SCENE_MS=650+700+PHOTO_ZOOM_MS;
export const REMOVE_MS=1250;
export type RackScenePlan={selectedId:string;row:number;column:number;depth:number;slots:(Bottle|null)[];blockers:Bottle[];signature:string};
/** Read-only projection of confirmed inventory. Never infer occupancy from the photo. */
export function rackScenePlan(id:string,inventory:readonly Bottle[]):RackScenePlan|null{
 const selected=inventory.find(b=>b.id===id&&b.status==='In Cellar');
 if(!selected||selected.location_type!=='RACK'||!selected.row_number||!selected.column_number||!selected.depth_number)return null;
 const slots=Array.from({length:3},(_,i)=>inventory.find(b=>b.status==='In Cellar'&&b.location_type==='RACK'&&b.row_number===selected.row_number&&b.column_number===selected.column_number&&b.depth_number===i+1)??null);
 // Refuse an ambiguous scene rather than choosing between duplicate occupants.
 const same=inventory.filter(b=>b.status==='In Cellar'&&b.location_type==='RACK'&&b.row_number===selected.row_number&&b.column_number===selected.column_number);
 if(same.length!==slots.filter(Boolean).length||slots[selected.depth_number-1]?.id!==id)return null;
 return {selectedId:id,row:selected.row_number,column:selected.column_number,depth:selected.depth_number,slots,blockers:slots.slice(0,selected.depth_number-1).filter((b):b is Bottle=>Boolean(b)),signature:JSON.stringify([id,selected.row_number,selected.column_number,selected.depth_number,...slots.map(b=>b?.id??null)])};
}
export const smooth=(t:number)=>{const p=Math.max(0,Math.min(1,t));return p*p*(3-2*p);};
export const sceneDuration=(count:number)=>650+count*REMOVE_MS+1700;
export function sceneFrame(plan:RackScenePlan,elapsed:number){
 const camera=smooth((elapsed-650-plan.blockers.length*REMOVE_MS)/1700);
 const staged=plan.blockers.map((b,i)=>{
  const t=Math.max(0,Math.min(1,(elapsed-650-i*REMOVE_MS)/REMOVE_MS));
  return {id:b.id,pull:smooth(t/.58),aside:smooth((t-.58)/.42),done:t>=1};
 });
 return {camera,staged,done:elapsed>=sceneDuration(plan.blockers.length)};
}
export function producerHeading(producer:string,name:string){return producer.trim()||name.trim()||'Unidentified wine';}
export const sceneBounds={x:[-5.6,2.2],y:[-.85,1.7],z:[-3.5,5.1]};
export const bayBounds={x:[-1.9,2.2],y:[-.85,1.7],z:[-3.5,3.5]};
/** Fit the entire bay and staging path in perspective, not only the selected mesh. */
export function sceneCamera(aspect:number,progress:number,staging=true){
 const angle=.12+progress*.81,elevation=.17+progress*.21,n=Math.hypot(1,elevation);
 const direction=[Math.sin(angle)/n,elevation/n,Math.cos(angle)/n],right=[Math.cos(angle),0,-Math.sin(angle)],up=[-elevation*Math.sin(angle)/n,1/n,-elevation*Math.cos(angle)/n],aim=staging?[-.8,.15,.65]:[0,.15,0],bounds=staging?sceneBounds:bayBounds;
 const tanV=Math.tan(34*Math.PI/360),tanH=tanV*Math.max(.1,aspect);let distance=1;
 for(const x of bounds.x)for(const y of bounds.y)for(const z of bounds.z){const p=[x-aim[0],y-aim[1],z-aim[2]],dot=(v:number[])=>p.reduce((sum,n,i)=>sum+n*v[i],0);distance=Math.max(distance,dot(direction)+Math.abs(dot(right))/(tanH*.88),dot(direction)+Math.abs(dot(up))/(tanV*.8));}
 return {aim,direction,right,up,distance,position:aim.map((v,i)=>v+direction[i]*distance),tanH,tanV};
}
