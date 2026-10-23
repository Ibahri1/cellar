import type {Bottle} from './domain.ts';
export const inventoryBottleUrl=(id:string)=>`/cellar?bottle=${encodeURIComponent(id)}`;
export const bottleFocusId=(search:string)=>new URLSearchParams(search).get('bottle');
export function firstOccupiedDepth(bottles:Bottle[],row:number,column:number){const depths=bottles.filter(b=>b.status==='In Cellar'&&b.location_type==='RACK'&&b.row_number===row&&b.column_number===column).map(b=>b.depth_number!);return depths.length?Math.min(...depths)-1:null;}
export type InventoryBrowse={query:string;filters:Record<string,string>;sort:string};
export const defaultBrowse=():InventoryBrowse=>({query:'',filters:{},sort:'name'});
// Browsing preferences only, scoped to this authenticated session. No inventory
// records or prices are stored here, and nothing is written to Firestore.
const preferences=new Map<string,InventoryBrowse>();
export const readBrowse=(scope:string)=>preferences.get(scope)??defaultBrowse();
export const rememberBrowse=(scope:string,value:InventoryBrowse)=>{preferences.set(scope,value);};
export const selectionScrollBehavior=(reduced:boolean):ScrollBehavior=>reduced?'instant':'smooth';
