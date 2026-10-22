import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {onAuthStateChanged,signOut,type User} from 'firebase/auth';
import {getDocFromServer,getDocsFromServer,onSnapshot,doc,collection,type QuerySnapshot,type DocumentData} from 'firebase/firestore';
import {auth,db,adminUid} from './firebase';
import {activeQuery,decodeBottle,decodeWine,loadBottle as fetchBottle,removalTotals,saveMutation,type Mutation} from './firestore';
import {safeError,type Bottle,type Wine} from './domain';
export type {Mutation} from './firestore';
type Totals={drank:number;gifted:number};
type Store={catalog?:Wine[];session:User|null;initializing:boolean;loading:boolean;ready:boolean;error:string;notice:string;bottles:Bottle[];totals:Totals|null;sync:string;refresh:()=>Promise<void>;mutate:(operation:Mutation)=>Promise<void>;logout:()=>Promise<void>;loadBottle:(id:string)=>Promise<Bottle|null>;loadPhoto:(id:string)=>Promise<string|null>};
export const CellarContext=createContext<Store|null>(null);
export const useCellar=()=>{const context=useContext(CellarContext);if(!context)throw Error('Cellar provider missing');return context;};
export function CellarProvider({children}:{children:ReactNode}){
 const [session,setSession]=useState<User|null>(null),[initializing,setInitializing]=useState(true),[loading,setLoading]=useState(false),[ready,setReady]=useState(false);
 const [bottles,setBottles]=useState<Bottle[]>([]),[totals,setTotals]=useState<Totals|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[sync,setSync]=useState('Connecting');
 const wines=useRef(new Map<string,Wine>()),generation=useRef(0),sequence=useRef(0),inFlight=useRef<Promise<void>|null>(null);
 const [catalog,setCatalog]=useState<Wine[]>([]),[presets,setPresets]=useState<Record<string,DocumentData>>({});
 const photos=useRef(new Map<string,Promise<string|null>>());
 useEffect(()=>{
  if(!auth){setInitializing(false);return;}
  return onAuthStateChanged(auth,user=>{
   generation.current++;sequence.current++;wines.current.clear();photos.current.clear();setBottles([]);setTotals(null);setReady(false);setError('');setNotice('');setLoading(false);
   setSession(user?.uid===adminUid?user:null);setInitializing(false);
   if(user&&user.uid!==adminUid){setError('Administrator access denied.');void signOut(auth!);}
  },()=>{setSession(null);setInitializing(false);setError('Your login could not be restored.');});
 },[]);
 const process=useCallback(async(snapshot:QuerySnapshot<DocumentData>,epoch:number)=>{
  const seq=++sequence.current;
  const missing=Array.from(new Set(snapshot.docs.map(d=>d.data().wineId as string))).filter(id=>!wines.current.has(id));
  await Promise.all(missing.map(async id=>{const w=await getDocFromServer(doc(db!,'wines',id));if(!w.exists())throw Error('Wine details are missing.');if(epoch===generation.current)wines.current.set(id,decodeWine(w.data()));}));
  if(epoch!==generation.current||seq!==sequence.current)return;
  const next=snapshot.docs.map(d=>decodeBottle(d.data(),wines.current.get(d.data().wineId)!));
  setBottles(previous=>{const versions=new Map(next.map(b=>[b.id,b.version]));return previous.length===next.length&&previous.every(b=>versions.get(b.id)===b.version)?previous:next;});setReady(true);setLoading(false);setError('');
 },[]);
 const refreshCounts=useCallback(async(epoch:number)=>{const next=await removalTotals(db!);if(epoch===generation.current)setTotals(next);},[]);
 useEffect(()=>{
  if(!db||!session)return;
  const epoch=generation.current;let stopped=false;setLoading(true);
  const report=(failure:unknown)=>{if(stopped||epoch!==generation.current)return;setError(safeError(failure));setSync('Updates unavailable');setLoading(false);if((failure as {code?:string})?.code==='permission-denied'){setBottles([]);setTotals(null);setReady(false);wines.current.clear();}};
  let first=true;
  const unsubscribe=onSnapshot(activeQuery(db),{includeMetadataChanges:true},snapshot=>{
   if(stopped||epoch!==generation.current||snapshot.metadata.hasPendingWrites)return;
   if(snapshot.metadata.fromCache){setSync(navigator.onLine?'Reconnecting':'Offline · last confirmed inventory');return;}
   setSync('Live');void process(snapshot,epoch).catch(report);
   if(first||snapshot.docChanges().some(change=>change.type==='removed'))void refreshCounts(epoch).catch(report);
   first=false;
  },report);
  const online=()=>setSync('Reconnecting'),offline=()=>setSync('Offline · last confirmed inventory');
  window.addEventListener('online',online);window.addEventListener('offline',offline);
  return()=>{stopped=true;unsubscribe();window.removeEventListener('online',online);window.removeEventListener('offline',offline);};
 },[session?.uid,process,refreshCounts]);
 const refresh=useCallback(async()=>{
  if(!db||!auth?.currentUser||auth.currentUser.uid!==adminUid)return;
  if(inFlight.current)return inFlight.current;
  const epoch=generation.current;setLoading(true);
  const task=(async()=>{const snapshot=await getDocsFromServer(activeQuery(db));await Promise.all([process(snapshot,epoch),refreshCounts(epoch)]);if(epoch===generation.current)setSync('Live');})().catch(failure=>{if(epoch===generation.current){setError(safeError(failure));setSync('Updates unavailable');}}).finally(()=>{if(epoch===generation.current)setLoading(false);inFlight.current=null;});
  inFlight.current=task;await task;
 },[process,refreshCounts]);
 const mutate=useCallback(async(operation:Mutation)=>{
  if(!db||auth?.currentUser?.uid!==adminUid)throw Error('Log in before changing inventory.');
  if(!navigator.onLine)throw Error('You are offline. Reconnect before saving.');
  try{await saveMutation(db,operation);setNotice('Saved to your cellar.');}
  catch(failure){throw Error(safeError(failure));}
  // Collection listeners apply only confirmed snapshots; no optimistic inventory.
 },[]);
 useEffect(()=>{setCatalog([]);setPresets({});if(!db||!session)return;const stopWines=onSnapshot(collection(db,'wines'),snapshot=>setCatalog(snapshot.docs.map(d=>decodeWine(d.data()))),()=>setError('Wine presets could not be loaded.'));const stopPresets=onSnapshot(collection(db,'winePresets'),snapshot=>setPresets(Object.fromEntries(snapshot.docs.map(d=>[d.id,d.data()]))),()=>setError('Preset defaults could not be synchronized. Check the updated rules.'));return()=>{stopWines();stopPresets();};},[session?.uid]);
 const enrich=(wine:Wine,presetId=wine.preset_id??wine.id):Wine=>{const preset=presets[presetId];return {...wine,preset_id:presetId,default_price_cents:preset?.defaultPriceCents??null,shared_photo_id:preset?.photoId??null,preset_configured:preset?.photoConfigured??false};};
 const displayed=bottles.map(b=>({...b,wine:enrich(b.wine,b.preset_id??b.wine_id)}));
 const logout=useCallback(async()=>{if(!auth)return;try{await signOut(auth);}catch{setError('Logout could not be completed. Please try again.');}},[]);
 const loadBottle=useCallback(async(id:string)=>db?fetchBottle(db,id,wines.current):null,[]);
 const loadPhoto=useCallback(async(id:string)=>{if(!db)return null;let request=photos.current.get(id);if(!request){request=getDocFromServer(doc(db,'photos',id)).then(snapshot=>snapshot.exists()?snapshot.data().dataUrl as string:null).catch(failure=>{photos.current.delete(id);throw failure;});photos.current.set(id,request);}return request;},[]);
 useEffect(()=>{if(notice){const timer=setTimeout(()=>setNotice(''),4500);return()=>clearTimeout(timer);}},[notice]);
 return <CellarContext.Provider value={{session,initializing,loading,ready,error,notice,bottles:displayed,catalog:catalog.map(w=>enrich(w)),totals,sync,refresh,mutate,logout,loadBottle,loadPhoto}}>{children}</CellarContext.Provider>;
}
