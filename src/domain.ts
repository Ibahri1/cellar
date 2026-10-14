export const wineTypes = ['Red','White','Rosé','Sparkling','Dessert','Fortified','Other'] as const;
export type Wine = {
  id: string; name: string; producer: string; vintage: number|null; wine_type: string;
  country: string; region: string; grape_variety: string; bottle_size: number;
  tasting_notes: string; image_url: string|null; drinking_window_start: number|null; drinking_window_end: number|null;
};
export type Placement = {location_type:'RACK'|'BOTTOM';row_number:number|null;column_number:number|null;depth_number:number|null};
export type Bottle = Placement & {
  id:string; wine_id:string; wine:Wine; status:'In Cellar'|'Drank'|'Gifted'; version:number;
  personal_rating:number|null;personal_notes:string;created_at:string;removed_at:string|null;
};
export type Activity = {id:string;bottle_id:string;wine_name:string;vintage:number|null;action:string;previous_location:string|null;new_location:string|null;created_at:string};
export const bottom: Placement = {location_type:'BOTTOM',row_number:null,column_number:null,depth_number:null};
export function locationLabel(p:Placement){return p.location_type==='BOTTOM'?'BOTTOM':`R${p.row_number}-C${p.column_number}-D${p.depth_number}`;}
export function allRackPositions():Placement[]{return Array.from({length:180},(_,i)=>({location_type:'RACK',row_number:Math.floor(i/15)+1,column_number:Math.floor(i%15/3)+1,depth_number:i%3+1}));}
export function availablePositions(bottles:Bottle[],excludeId?:string){const occupied=new Set(bottles.filter(b=>b.status==='In Cellar'&&b.id!==excludeId&&b.location_type==='RACK').map(locationLabel));return allRackPositions().filter(p=>!occupied.has(locationLabel(p)));}
export function blockedBy(bottle:Placement,bottles:Bottle[]){return bottle.location_type==='BOTTOM'?[]:bottles.filter(b=>b.status==='In Cellar'&&b.location_type==='RACK'&&b.row_number===bottle.row_number&&b.column_number===bottle.column_number&&b.depth_number!<bottle.depth_number!);}
export function wineIdentity(w:Wine){return [w.name.trim().toLocaleLowerCase(),w.producer.trim().toLocaleLowerCase(),w.vintage??'NV'].join('|');}
export function statistics(bottles:Bottle[]){const active=bottles.filter(b=>b.status==='In Cellar');const main=active.filter(b=>b.location_type==='RACK').length;return {main,bottom:active.length-main,total:active.length,capacity:180,available:180-main,occupancy:main/180*100,drank:bottles.filter(b=>b.status==='Drank').length,gifted:bottles.filter(b=>b.status==='Gifted').length,types:Object.fromEntries(wineTypes.map(t=>[t,active.filter(b=>b.wine.wine_type===t).length]))};}
export function safeError(error:unknown){const e=error as {code?:string;message?:string};if(e?.code==='23505')return 'That rack position was just occupied. Refresh and select another position.';if(e?.code==='40001')return 'This bottle changed on another device. Close this editor and reopen the latest record.';if(e?.code==='42501')return 'Your session has expired or access is not enabled. Please log in again.';if(e?.code==='P0002')return 'This bottle is no longer available. Refresh your inventory.';if(e?.code?.startsWith('22')||e?.code?.startsWith('23'))return 'Check the wine details and storage positions, then try again.';return 'The request could not be confirmed. Check your connection and retry; the same request will not create duplicate bottles.';}
