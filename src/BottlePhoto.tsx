import {useEffect,useRef,useState} from 'react';
import {useCellar} from './store';
import type {Bottle} from './domain';
export default function BottlePhoto({bottle,compact=false}:{bottle:Bottle;compact?:boolean}){
 const {loadPhoto}=useCellar();const [source,setSource]=useState<string|null>(bottle.photo_id?null:bottle.wine.image_url),[error,setError]=useState(false),[retry,setRetry]=useState(0);const ref=useRef<HTMLSpanElement>(null);
 useEffect(()=>{let active=true;setError(false);setSource(bottle.photo_id?null:bottle.wine.image_url);if(!bottle.photo_id)return;
  const observer=new IntersectionObserver(entries=>{if(!entries.some(e=>e.isIntersecting))return;observer.disconnect();void loadPhoto(bottle.photo_id!).then(data=>{if(active){setSource(data);setError(!data);}}).catch(()=>{if(active)setError(true);});});
  if(ref.current)observer.observe(ref.current);return()=>{active=false;observer.disconnect();};
 },[bottle.photo_id,bottle.wine.image_url,loadPhoto,retry]);
 if(!bottle.photo_id&&!source&&!error)return null;
 return <span ref={ref} className={compact?'photo-thumb':'photo-detail'}>{source?<img src={source} alt={`Photo of ${bottle.wine.name}`} loading="lazy" referrerPolicy="no-referrer" onError={()=>{setSource(null);setError(true);}}/>:error?<button type="button" className="text-button" onClick={()=>setRetry(n=>n+1)}>Photo unavailable · Retry</button>:<small>Loading photo…</small>}</span>;
}
