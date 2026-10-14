import {createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode} from 'react';
import {createClient, type Session} from '@supabase/supabase-js';
import {safeError, type Bottle} from './domain';

const url=import.meta.env.VITE_SUPABASE_URL?.trim();
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
const memory=new Map<string,string>();
const storage={getItem:(k:string)=>{try{return sessionStorage.getItem(k)??memory.get(k)??null;}catch{return memory.get(k)??null;}},setItem:(k:string,v:string)=>{try{sessionStorage.setItem(k,v);}catch{memory.set(k,v);}},removeItem:(k:string)=>{try{sessionStorage.removeItem(k);}catch{/* Memory-only session when browser storage is unavailable. */}finally{memory.delete(k);}}};
// Inventory is never persisted in browser storage. Only standard Auth sessions
// survive refresh in this tab; closing the tab ends local persistence.
export const client=(()=>{try{return url&&key?createClient(url.replace(/\/+$/,''),key,{auth:{storage,storageKey:'private-cellar-auth',persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}}):null;}catch{return null;}})();
export type Mutation = {action:string;payload:Record<string,unknown>;requestId:string};
type Store={session:Session|null;initializing:boolean;loading:boolean;ready:boolean;error:string;notice:string;bottles:Bottle[];sync:string;refresh:()=>Promise<void>;mutate:(operation:Mutation)=>Promise<void>;logout:()=>Promise<void>};
export const CellarContext=createContext<Store|null>(null);
const Context=CellarContext;
export const useCellar=()=>{const value=useContext(Context);if(!value)throw Error('Cellar provider missing');return value;};

export function CellarProvider({children}:{children:ReactNode}){
 const [session,setSession]=useState<Session|null>(null),[initializing,setInitializing]=useState(true);
 const [bottles,setBottles]=useState<Bottle[]>([]),[loading,setLoading]=useState(false),[ready,setReady]=useState(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[sync,setSync]=useState('Connecting'),[expiresAt,setExpiresAt]=useState<string|null>(null);
 const sessionRef=useRef<Session|null>(null),epoch=useRef(0),inFlight=useRef<Promise<void>|null>(null),dirty=useRef(false);
 const refresh=useCallback(async()=>{
  if(!client||!sessionRef.current)return;
  if(inFlight.current){dirty.current=true;return inFlight.current;}
  const generation=epoch.current;
  const task=(async()=>{
   do{
    dirty.current=false;setLoading(true);
    const {data,error:failure}=await client.rpc('cellar_snapshot');
    if(generation!==epoch.current)return;
    if(failure){setError(safeError(failure));setSync('Updates unavailable');
     if(failure.code==='42501'||failure.code==='PGRST301'){setBottles([]);setReady(false);await client.auth.signOut({scope:'local'});}
     break;
    }
    setBottles(previous=>{const incoming=data.bottles as Bottle[];const versions=new Map(incoming.map(b=>[b.id,b.version]));return previous.length===incoming.length&&previous.every(b=>versions.get(b.id)===b.version)?previous:incoming;});setExpiresAt(data.session_expires_at);setReady(true);setError('');
   }while(dirty.current&&generation===epoch.current);
  })().catch(()=>{if(generation===epoch.current){setError('Inventory could not be refreshed. Check your connection.');setSync('Updates unavailable');}}).finally(()=>{if(generation===epoch.current)setLoading(false);inFlight.current=null;});
  inFlight.current=task;await task;
 },[]);
 useEffect(()=>{if(!session||!expiresAt)return;const timer=setTimeout(()=>{setBottles([]);setReady(false);setExpiresAt(null);void client?.auth.signOut({scope:'local'});},Math.max(0,new Date(expiresAt).getTime()-Date.now()));return()=>clearTimeout(timer);},[session?.user.id,expiresAt]);
 useEffect(()=>{
  if(!client){setInitializing(false);return;}
  let active=true;
  const change=(next:Session|null)=>{sessionRef.current=next;setSession(next);setInitializing(false);if(!next){epoch.current++;setBottles([]);setReady(false);setLoading(false);setError('');}};
  const {data:{subscription}}=client.auth.onAuthStateChange((_event,next)=>{if(active)change(next);});
  void client.auth.getSession().then(({data,error})=>{if(active){if(error)setError('Your previous session could not be restored.');change(data.session);}});
  return()=>{active=false;subscription.unsubscribe();};
 },[]);
 useEffect(()=>{
  if(!client||!session?.user.id)return;
  void refresh();let timer:ReturnType<typeof setTimeout>|undefined;let active=true;
  const schedule=()=>{clearTimeout(timer);timer=setTimeout(()=>void refresh(),250);};
  const channel=client.channel('shared-cellar-history').on('postgres_changes',{event:'INSERT',schema:'public',table:'activity_history'},schedule).subscribe(status=>{if(!active)return;setSync(status==='SUBSCRIBED'?'Live':status==='CHANNEL_ERROR'||status==='TIMED_OUT'?'Live updates unavailable':'Connecting');if(status==='SUBSCRIBED')schedule();});
  const online=()=>{setSync('Reconnecting');schedule();};
  const offline=()=>setSync('Offline');
  const focus=()=>{if(document.visibilityState==='visible')schedule();};
  window.addEventListener('online',online);window.addEventListener('offline',offline);window.addEventListener('focus',schedule);document.addEventListener('visibilitychange',focus);
  return()=>{active=false;clearTimeout(timer);void client!.removeChannel(channel);window.removeEventListener('online',online);window.removeEventListener('offline',offline);window.removeEventListener('focus',schedule);document.removeEventListener('visibilitychange',focus);};
 },[session?.user.id,refresh]);
 const mutate=useCallback(async(operation:Mutation)=>{
  if(!client||!sessionRef.current)throw Error('Log in before changing inventory.');
  if(!navigator.onLine)throw Error('You are offline. Reconnect before saving.');
  const {error:failure}=await client.rpc('mutate_cellar',{p_action:operation.action,p_payload:operation.payload,p_request_id:operation.requestId});
  if(failure){await refresh();throw Error(safeError(failure));}
  setNotice('Saved to your cellar.');await refresh();
 },[refresh]);
 const logout=useCallback(async()=>{
  if(!client)return;
  const {error:failure}=await client.auth.signOut({scope:'local'});
  if(failure){setError('Logout could not be confirmed. Reconnect and try again.');return;}
  setNotice('');
 },[]);
 useEffect(()=>{if(notice){const timer=setTimeout(()=>setNotice(''),4500);return()=>clearTimeout(timer);}},[notice]);
 return <Context.Provider value={{session,initializing,loading,ready,error,notice,bottles,sync,refresh,mutate,logout}}>{children}</Context.Provider>;
}
