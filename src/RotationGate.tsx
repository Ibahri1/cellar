import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {RotateCw,Smartphone} from 'lucide-react';
export default function RotationGate({testDevice=false}:{testDevice?:boolean}){
 const [portrait,setPortrait]=useState(false);const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const update=()=>{const device=testDevice||(navigator.maxTouchPoints>0&&window.matchMedia('(pointer:coarse)').matches);const orientation=screen.orientation?.type;setPortrait(device&&(testDevice?window.innerHeight>window.innerWidth:orientation?orientation.startsWith('portrait'):window.matchMedia('(orientation:portrait)').matches));};update();window.addEventListener('resize',update);screen.orientation?.addEventListener('change',update);return()=>{window.removeEventListener('resize',update);screen.orientation?.removeEventListener('change',update);};},[testDevice]);
 useEffect(()=>{document.documentElement.classList.toggle('device-portrait',portrait);if(!portrait)return;const element=ref.current;const show=()=>{if(element&&!element.open)element.showModal();};show();return()=>{element?.close();document.documentElement.classList.remove('device-portrait');};},[portrait]);
 return portrait?createPortal(<dialog className="rotation-gate" ref={ref} data-screensaver-pause="true" aria-label="Please Rotate Your Device" onCancel={e=>e.preventDefault()}><div className="rotation-icon"><Smartphone size={46}/><RotateCw size={26}/></div><h1>Please Rotate Your Device</h1><p>For the best BAHRI Wine Cellar experience, turn your phone sideways.</p></dialog>,document.body):null;
}
