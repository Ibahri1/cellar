import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {bahriArtwork} from './BrandLogo';
import {IdleTimer} from './idle';
import './screensaver.css';

export default function Screensaver({enabled,paused=false}:{enabled:boolean;paused?:boolean}){
 const [visible,setVisible]=useState(false),dialog=useRef<HTMLDialogElement>(null),previousFocus=useRef<HTMLElement|null>(null);
 useEffect(()=>{if(!enabled){setVisible(false);return;}const preload=new Image();preload.src=bahriArtwork;},[enabled]);
 useEffect(()=>{
  if(!enabled||visible)return;
  const blocked=()=>paused||document.hidden||Boolean(document.querySelector('form:not([data-idle-ignore]),[aria-busy="true"],[data-screensaver-pause="true"]'))||Boolean(document.activeElement?.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]'));
  const timer=new IdleTimer(()=>{if(blocked()){timer.setPaused(true);return;}previousFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;setVisible(true);},{now:()=>performance.now(),set:(callback,delay)=>window.setTimeout(callback,delay),clear:handle=>window.clearTimeout(handle as number)});
  const syncPause=()=>timer.setPaused(blocked());
  const activity=()=>{syncPause();timer.activity();};
  const events=['pointermove','pointerdown','pointerup','click','keydown','input','scroll','wheel','touchstart','touchmove','focusin','focusout'] as const;
  const options={capture:true,passive:true};
  events.forEach(event=>document.addEventListener(event,activity,options));
  document.addEventListener('visibilitychange',activity);
  // Changes to forms/operation flags pause/resume the clock; passive inventory
  // updates do not count as user activity and do not reset the deadline.
  const observer=new MutationObserver(syncPause);
  observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['aria-busy','data-screensaver-pause','contenteditable']});
  syncPause();timer.activity();
  return()=>{timer.stop();observer.disconnect();events.forEach(event=>document.removeEventListener(event,activity,true));document.removeEventListener('visibilitychange',activity);};
 },[enabled,paused,visible]);
 useEffect(()=>{if(!enabled||!visible)return;const element=dialog.current;if(!element)return;element.showModal();return()=>{element.close();if(previousFocus.current?.isConnected)previousFocus.current.focus({preventScroll:true});};},[enabled,visible]);
 if(!enabled||!visible)return null;
 const dismiss=()=>setVisible(false);
 return createPortal(<dialog ref={dialog} className="bahri-screensaver" aria-label="BAHRI screensaver" onCancel={event=>{event.preventDefault();dismiss();}}><button className="screensaver-dismiss" type="button" aria-label="Dismiss screensaver and return to your cellar" autoFocus onClick={event=>{event.preventDefault();event.stopPropagation();dismiss();}}><img src={bahriArtwork} alt="BAHRI" width={1774} height={887} draggable={false}/><span className="sr-only">Tap or click anywhere to return. You can also press Escape, Enter or Space.</span></button></dialog>,document.body);
}
