import {useEffect,useRef,useState} from 'react';
import {selectionScrollBehavior} from './bottle-navigation';
/** Reveal once per intentional selection after React commits its conditional
 * target. Cleanup cancels stale frames/highlights when selections change fast. */
export function useSelectionReveal(key:string|null,enabled:boolean,getTarget:()=>HTMLElement|null,reducedOverride?:boolean){
 const getter=useRef(getTarget);getter.current=getTarget;const handled=useRef<string|null>(null);const [highlight,setHighlight]=useState<string|null>(null);
 useEffect(()=>{
  if(!key||!enabled){setHighlight(null);return;}
  if(handled.current===key){setHighlight(null);return;}
  let frame=0,timeout:ReturnType<typeof setTimeout>|undefined,done=false;
  const reveal=()=>{if(done||document.documentElement.classList.contains('device-portrait'))return;cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const target=getter.current();if(!target||!target.isConnected||getComputedStyle(target).visibility==='hidden')return;done=true;handled.current=key;const reduced=reducedOverride??window.matchMedia('(prefers-reduced-motion:reduce)').matches;target.scrollIntoView({behavior:selectionScrollBehavior(reduced),block:'center',inline:'nearest'});target.focus({preventScroll:true});setHighlight(key);timeout=setTimeout(()=>setHighlight(null),2800);});};
  // Defers navigation performed in portrait until the rotation gate is gone.
  const observer=new MutationObserver(reveal);observer.observe(document.documentElement,{attributes:true,attributeFilter:['class']});reveal();
  return()=>{cancelAnimationFrame(frame);observer.disconnect();if(timeout)clearTimeout(timeout);};
 },[key,enabled,reducedOverride]);
 return highlight===key&&enabled;
}
