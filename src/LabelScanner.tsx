import {useEffect,useRef,useState} from 'react';
import {Camera,Upload,ScanLine,LoaderCircle} from 'lucide-react';
import {extractLabel,type LabelFields} from './label';
import {imageCanvas} from './photos';
import type {Worker} from 'tesseract.js';
export default function LabelScanner({onResult,onBusy}:{onResult:(fields:LabelFields)=>void;onBusy:(busy:boolean)=>void}){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[progress,setProgress]=useState(''),[text,setText]=useState(''),[message,setMessage]=useState('');
 const camera=useRef<HTMLInputElement>(null),upload=useRef<HTMLInputElement>(null),worker=useRef<Worker|null>(null),epoch=useRef(0),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;epoch.current++;void worker.current?.terminate();};},[]);
 async function scan(file?:File){if(!file||busy)return;const n=++epoch.current;setBusy(true);onBusy(true);setText('');setMessage('');setProgress('Preparing label…');
  let current:Worker|null=null;
  try{
   const canvas=await imageCanvas(file,1800);const {createWorker}=await import('tesseract.js');
   if(n!==epoch.current)return;
   current=await createWorker('eng',1,{workerPath:`${import.meta.env.BASE_URL}ocr/worker.min.js`,corePath:`${import.meta.env.BASE_URL}ocr/core`,langPath:`${import.meta.env.BASE_URL}ocr/lang`,cacheMethod:'write',logger:info=>{if(mounted.current&&n===epoch.current)setProgress(info.status==='recognizing text'?`Reading label · ${Math.round(info.progress*100)}%`:'Loading local OCR engine…');}});
   worker.current=current;if(n!==epoch.current)return;
   const {data}=await current.recognize(canvas);if(n!==epoch.current||!mounted.current)return;
   setText(data.text);const fields=extractLabel(data.text,data.confidence);
   if(Object.keys(fields).length){onResult(fields);setMessage('Recognized fields filled in. Review every result before saving; OCR can misread a label.');}
   else setMessage('No fields could be identified reliably. Try a sharper, well-lit label or enter the details manually.');
  }catch{if(mounted.current&&n===epoch.current)setMessage('The label could not be scanned. Check the image and try again. Scanning needs a browser with WebAssembly support.');}
  finally{if(current)await current.terminate();if(worker.current===current)worker.current=null;if(mounted.current&&n===epoch.current){setBusy(false);onBusy(false);}}
 }
 function cancel(){epoch.current++;void worker.current?.terminate();worker.current=null;setBusy(false);onBusy(false);setMessage('Scan cancelled. Your form has not been saved.');}
 return <section className="label-scanner"><button type="button" className="secondary" disabled={busy} onClick={()=>setOpen(!open)} aria-expanded={open}><ScanLine size={16}/> Scan Wine Label</button>{open&&<div className="scanner-content"><p className="muted">OCR runs on this device. Photos are not sent to external recognition services. Clear English text works best; identification is limited.</p><div className="photo-actions"><button type="button" className="secondary" disabled={busy} onClick={()=>camera.current?.click()}><Camera size={15}/> Take Label Photo</button><button type="button" className="secondary" disabled={busy} onClick={()=>upload.current?.click()}><Upload size={15}/> Upload Label Photo</button>{busy&&<button type="button" className="text-button" onClick={cancel}>Cancel scan</button>}</div><input hidden ref={camera} type="file" aria-label="Take wine label photo" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={e=>{void scan(e.target.files?.[0]);e.target.value='';}}/><input hidden ref={upload} type="file" aria-label="Upload wine label photo" accept="image/jpeg,image/png,image/webp" onChange={e=>{void scan(e.target.files?.[0]);e.target.value='';}}/>{busy&&<p className="scan-progress" role="status"><LoaderCircle className="spin" size={15}/> {progress}</p>}{message&&<p className="warning" role="status">{message}</p>}{text&&<details><summary>Review recognized text</summary><pre>{text}</pre></details>}</div>}</section>;
}
