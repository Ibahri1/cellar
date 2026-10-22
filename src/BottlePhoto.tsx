import {useEffect,useRef,useState} from 'react';
import {useCellar} from './store';
import type {Bottle} from './domain';
export default function BottlePhoto({bottle,compact=false}:{bottle:Bottle;compact?:boolean}){
 const {loadPhoto,catalog}=useCellar();const preset=catalog?.find(w=>(w.preset_id??w.id)===(bottle.preset_id??bottle.wine_id));const metadata=preset??bottle.wine;
 const effectivePhoto=metadata.preset_configured?metadata.shared_photo_id:bottle.photo_id;
 const fallback=metadata.preset_configured?null:bottle.wine.image_url;
 const [source,setSource]=useState<string|null>(effectivePhoto?null:fallback),[error,setError]=useState(false),[retry,setRetry]=useState(0);const ref=useRef<HTMLSpanElement>(null);
 useEffect(()=>{let active=true;setError(false);setSource(effectivePhoto?null:fallback);if(!effectivePhoto)return;
  const observer=new IntersectionObserver(entries=>{if(!entries.some(e=>e.isIntersecting))return;observer.disconnect();void loadPhoto(effectivePhoto!).then(data=>{if(active){setSource(data);setError(!data);}}).catch(()=>{if(active)setError(true);});});
  if(ref.current)observer.observe(ref.current);return()=>{active=false;observer.disconnect();};
 },[effectivePhoto,fallback,loadPhoto,retry]);
 if(!effectivePhoto&&!source&&!error)return null;
 return <span ref={ref} className={compact?'photo-thumb':'photo-detail'}>{source?<img src={source} alt={`Photo of ${bottle.wine.name}`} loading="lazy" referrerPolicy="no-referrer" onError={()=>{setSource(null);setError(true);}}/>:error?<button type="button" className="text-button" onClick={()=>setRetry(n=>n+1)}>Photo unavailable · Retry</button>:<small>Loading photo…</small>}</span>;
}
