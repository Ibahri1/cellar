import {allRackPositions,locationLabel,type Bottle,type Wine,type Placement,bottom} from './domain.ts';
export const bottleSizes=[{value:187,label:'187mL'},{value:375,label:'375mL'},{value:750,label:'750mL'},{value:1000,label:'1L'},{value:1500,label:'1.5L'},{value:3000,label:'3L'}] as const;
export const formatBottleSize=(size:number)=>bottleSizes.find(s=>s.value===size)?.label??`${size}mL`;
const collator=new Intl.Collator(undefined,{sensitivity:'base',numeric:true});
export function sortPresets(wines:Wine[]){const latest=new Map<string,Wine>();for(const wine of wines){const key=wine.preset_id??wine.id,previous=latest.get(key);if(!previous||(wine.created_at??'')>(previous.created_at??''))latest.set(key,wine);}return [...latest.values()].sort((a,b)=>collator.compare(a.producer||'\uffff',b.producer||'\uffff')||collator.compare(a.name,b.name)||(a.vintage??0)-(b.vintage??0));}
export type Layout=Record<string,string>;
export function placement(key:string):Placement{if(key==='BOTTOM')return bottom;const match=key.match(/^R(\d+)-C(\d+)-D(\d+)$/);const found=match&&allRackPositions().find(p=>locationLabel(p)===key);if(!found)throw Error('Invalid saved rack position.');return found;}
export const layoutOf=(bottles:Bottle[]):Layout=>Object.fromEntries(bottles.filter(b=>b.status==='In Cellar').map(b=>[b.id,locationLabel(b)]));
export function previewRestore(saved:Layout,current:Layout){
 const missing=Object.keys(saved).filter(id=>!(id in current));
 const moves=Object.entries(saved).filter(([id,key])=>id in current&&current[id]!==key).map(([id,to])=>({id,from:current[id],to}));
 const conflicts:string[]=[];const targets=new Map<string,string>();
 for(const [id,to] of Object.entries(saved)){try{placement(to);}catch{conflicts.push(`Invalid location for ${id}: ${to}`);continue;}if(to!=='BOTTOM'){if(targets.has(to))conflicts.push(`Duplicate destination ${to}`);targets.set(to,id);}}
 const changing=new Set(moves.map(m=>m.id));
 for(const m of moves){const occupant=Object.keys(current).find(id=>id!==m.id&&current[id]===m.to&&m.to!=='BOTTOM');if(occupant&&!changing.has(occupant))conflicts.push(`${m.to} is occupied by ${occupant}; move that bottle first.`);}
 return {moves,missing,conflicts,partial:missing.length>0};
}
/** Cycles are broken using a named temporary BOTTOM staging step. A durable
 * restore lock excludes other inventory writes until every step is complete. */
export function restoreSteps(saved:Layout,current:Layout){const preview=previewRestore(saved,current);if(preview.conflicts.length)throw Error(preview.conflicts.join('\n'));const state={...current},steps:{id:string;to:string}[]=[];let pending=[...preview.moves];while(pending.length){const free=pending.find(m=>m.to==='BOTTOM'||!Object.entries(state).some(([id,key])=>id!==m.id&&key===m.to));if(free){steps.push({id:free.id,to:free.to});state[free.id]=free.to;pending=pending.filter(m=>m!==free);}else{const first=pending[0];steps.push({id:first.id,to:'BOTTOM'});state[first.id]='BOTTOM';}}return steps;}
