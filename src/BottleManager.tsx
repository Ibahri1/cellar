import {useEffect,useRef,useState,type FormEvent} from 'react';
import {X, Wine as WineIcon,LoaderCircle} from 'lucide-react';
import {availablePositions,blockedBy,bottom,locationLabel,wineTypes,wineIdentity,type Bottle,type Placement,type Wine} from './domain';
import {useCellar} from './store';
import {MAX_ADD_BATCH} from './firestore';
export type Editor = {mode:'add';location?:Placement}|{mode:'details'|'edit'|'move'|'Drank'|'Gifted';bottle:Bottle};
type WineDraft=Omit<Wine,'id'>;
const emptyWine:WineDraft={name:'',producer:'',vintage:null,wine_type:'Red',country:'',region:'',grape_variety:'',bottle_size:750,tasting_notes:'',image_url:null,drinking_window_start:null,drinking_window_end:null};
const years=Array.from({length:new Date().getFullYear()-1848},(_,i)=>new Date().getFullYear()+1-i);
const commonCountries=['France','Italy','Spain','United States','Portugal','Germany','Argentina','Chile','Australia','New Zealand','South Africa','Austria','Greece'];
const commonGrapes=['Cabernet Sauvignon','Merlot','Pinot Noir','Syrah','Grenache','Tempranillo','Sangiovese','Nebbiolo','Malbec','Chardonnay','Sauvignon Blanc','Riesling','Pinot Grigio','Chenin Blanc','Blend'];
function PositionPicker({value,onChange,available,label}:{value:Placement;onChange:(p:Placement)=>void;available:Placement[];label:string}){
 const candidates=available;
 const rows=Array.from({length:12},(_,i)=>i+1),cols=Array.from({length:5},(_,i)=>i+1);
 function change(part:'row_number'|'column_number'|'depth_number',n:number){const next={...value,[part]:n};onChange(candidates.find(p=>locationLabel(p)===locationLabel(next))??candidates.find(p=>p[part]===n)??value);}
 return <fieldset className="placement"><legend>{label}</legend><label>Storage<select value={value.location_type} onChange={e=>onChange(e.target.value==='BOTTOM'?bottom:candidates[0]??{location_type:'RACK',row_number:1,column_number:1,depth_number:1})}><option value="RACK" disabled={!candidates.length}>Main rack</option><option value="BOTTOM">Bottom storage</option></select></label>{value.location_type==='RACK'&&<><label>Row<select value={value.row_number!} onChange={e=>change('row_number',+e.target.value)}>{rows.map(r=><option key={r} value={r} disabled={!candidates.some(p=>p.row_number===r)}>{r}</option>)}</select></label><label>Column<select value={value.column_number!} onChange={e=>{const c=+e.target.value;onChange(candidates.find(p=>p.row_number===value.row_number&&p.column_number===c)??value);}}>{cols.map(c=><option key={c} value={c} disabled={!candidates.some(p=>p.row_number===value.row_number&&p.column_number===c)}>{c}</option>)}</select></label><label>Depth<select value={value.depth_number!} onChange={e=>change('depth_number',+e.target.value)}>{['Front','Middle','Back'].map((d,i)=><option key={d} value={i+1} disabled={!candidates.some(p=>p.row_number===value.row_number&&p.column_number===value.column_number&&p.depth_number===i+1)}>{d}{candidates.some(p=>p.row_number===value.row_number&&p.column_number===value.column_number&&p.depth_number===i+1)?'':' · occupied'}</option>)}</select></label></>}</fieldset>;
}
export default function BottleManager({editor,onClose,onChange}:{editor:Editor;onClose:()=>void;onChange:(e:Editor)=>void}){
 const {bottles,mutate}=useCellar();
 const bottle='bottle'in editor?editor.bottle:null;
 const [wine,setWine]=useState<WineDraft>(bottle?.wine??emptyWine),[selectedWine,setSelectedWine]=useState('');
 const [notes,setNotes]=useState(bottle?.personal_notes??''),[rating,setRating]=useState<number|null>(bottle?.personal_rating??null),[quantity,setQuantity]=useState(1);
 const available=availablePositions(bottles,bottle?.id);
 const [placements,setPlacements]=useState<Placement[]>(['location'in editor&&editor.location?editor.location:bottle??available[0]??bottom]);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const request=useRef<{key:string;id:string}|null>(null),dialog=useRef<HTMLDialogElement>(null);
 const existing=Array.from(new Map(bottles.map(b=>[b.wine.id,b.wine])).values());
 const suggestions=(key:'producer'|'country'|'region'|'grape_variety',defaults:string[]=[])=>Array.from(new Set([...defaults,...existing.map(w=>w[key]).filter(Boolean)])).sort();
 const duplicates=wine.name?bottles.filter(b=>b.status==='In Cellar'&&wineIdentity(b.wine)===wineIdentity({...wine,id:''})).length:0;
 useEffect(()=>{const element=dialog.current;const portrait=window.matchMedia('(orientation: portrait)');const update=()=>{if(portrait.matches)element?.close();else if(element&&!element.open)element.showModal();};update();portrait.addEventListener('change',update);return()=>{portrait.removeEventListener('change',update);element?.close();};},[]);
 function field<K extends keyof WineDraft>(key:K,value:WineDraft[K]){setWine(w=>({...w,[key]:value}));setSelectedWine('');}
 function changeQuantity(n:number){setQuantity(n);if(Number.isSafeInteger(n)&&n>0&&placements[0].location_type==='RACK'&&n<=180){setPlacements(old=>{const next=old.slice(0,n);while(next.length<n)next.push(available.find(p=>!next.some(o=>locationLabel(o)===locationLabel(p)))??bottom);return next;});}}
 async function submit(e:FormEvent){e.preventDefault();if(busy)return;setError('');
  const payload:Record<string,unknown>={};
  if(editor.mode==='add'){
   if(!Number.isSafeInteger(quantity)||quantity<1||quantity>MAX_ADD_BATCH){setError(`Add 1–${MAX_ADD_BATCH} bottles per atomic save. Bottom storage has no total capacity limit.`);return;}
   const places=placements[0].location_type==='BOTTOM'?Array.from({length:quantity},()=>bottom):placements.slice(0,quantity);
   if(places.length!==quantity){setError('Choose one storage position for every bottle.');return;}
   const keys=places.filter(p=>p.location_type==='RACK').map(locationLabel);
   if(new Set(keys).size!==keys.length||keys.some(k=>!available.some(p=>locationLabel(p)===k))){setError('Each rack bottle needs a different available position.');return;}
   Object.assign(payload,{wine,placements:places,personal_notes:notes,personal_rating:rating,...(selectedWine?{wine_id:selectedWine}:{})});
  }else if(bottle){
   Object.assign(payload,{id:bottle.id,version:bottle.version});
   if(editor.mode==='edit')Object.assign(payload,{wine,personal_notes:notes,personal_rating:rating});
   if(editor.mode==='move'){
    if(placements[0].location_type==='RACK'&&!available.some(p=>locationLabel(p)===locationLabel(placements[0]))){setError('Choose an available position.');return;}
    if(locationLabel(placements[0])===locationLabel(bottle)){setError('Choose a different destination.');return;}
    payload.location=placements[0];
   }
  }
  const key=JSON.stringify([editor.mode,payload]);if(request.current?.key!==key)request.current={key,id:crypto.randomUUID()};
  setBusy(true);
  try{await mutate({action:editor.mode,payload,requestId:request.current.id});onClose();}
  catch(failure){setError((failure as Error).message);}finally{setBusy(false);}
 }
 const remove=editor.mode==='Drank'||editor.mode==='Gifted';
 const title=editor.mode==='add'?'Add bottles':editor.mode==='details'?'Bottle details':editor.mode==='edit'?'Edit bottle':editor.mode==='move'?'Move bottle':`Mark as ${editor.mode}`;
 return <dialog ref={dialog} className={`bottle-dialog ${editor.mode==='details'?'detail-dialog':''}`} onCancel={e=>{if(busy)e.preventDefault();else onClose();}}><div className="dialog-title"><div><span className="eyebrow">PRIVATE CELLAR</span><h2>{title}</h2></div><button disabled={busy} className="icon-button" aria-label="Close bottle panel" onClick={onClose}><X size={18}/></button></div>
 {editor.mode==='details'&&bottle?<><div className="bottle-heading"><WineIcon size={28} strokeWidth={1}/><div><h3>{bottle.wine.name}</h3><p>{bottle.wine.producer} · {bottle.wine.vintage??'NV'}</p></div></div>{bottle.wine.image_url&&<img className="bottle-image" src={bottle.wine.image_url} alt={bottle.wine.name} referrerPolicy="no-referrer" onError={e=>{e.currentTarget.hidden=true;}}/>}<dl className="bottle-facts">{Object.entries({'Type':bottle.wine.wine_type,'Country':bottle.wine.country,'Region':bottle.wine.region,'Grape variety':bottle.wine.grape_variety,'Bottle size':`${bottle.wine.bottle_size} ml`,'Location':locationLabel(bottle),'Status':bottle.status,'Personal rating':bottle.personal_rating?`${bottle.personal_rating} / 5`:'Not rated','Tasting notes':bottle.wine.tasting_notes,'Personal notes':bottle.personal_notes,'Drinking window':bottle.wine.drinking_window_start||bottle.wine.drinking_window_end?`${bottle.wine.drinking_window_start??'?'} – ${bottle.wine.drinking_window_end??'?'}`:'Not recorded','Added':new Date(bottle.created_at).toLocaleString(),'Removed':bottle.removed_at?new Date(bottle.removed_at).toLocaleString():''}).map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v||'—'}</dd></div>)}</dl>{blockedBy(bottle,bottles).length>0&&<p className="warning">This bottle is behind {blockedBy(bottle,bottles).map(locationLabel).join(', ')}. Remove the bottles in front first.</p>}<div className="button-row">{(['edit',...(bottle.status==='In Cellar'?['move','Drank','Gifted']:[])] as Editor['mode'][]).map(mode=><button key={mode} className="secondary" onClick={()=>onChange({mode:mode as 'edit'|'move'|'Drank'|'Gifted',bottle})}>{mode==='edit'?'Edit':mode==='move'?'Move':`Mark ${mode}`}</button>)}</div></>:<form onSubmit={submit}>
 {remove&&bottle?<div className="confirm-copy"><WineIcon size={30} strokeWidth={1}/><h3>{bottle.wine.name} · {bottle.wine.vintage??'NV'}</h3><p>Confirm marking this bottle {editor.mode}. Its storage position will be freed and the dated bottle record will remain in History.</p></div>:<>
 {(editor.mode==='add'||editor.mode==='edit')&&<><div className="form-grid">{editor.mode==='add'&&<label className="wide">Reuse a saved wine<select value={selectedWine} onChange={e=>{setSelectedWine(e.target.value);const found=existing.find(w=>w.id===e.target.value);setWine(found??emptyWine);}}><option value="">Enter wine details</option>{existing.map(w=><option key={w.id} value={w.id}>{w.producer} · {w.name} · {w.vintage??'NV'}</option>)}</select></label>}
 <label>Wine name<input required maxLength={200} value={wine.name} onChange={e=>field('name',e.target.value)}/></label>
 <label>Producer<input list="producer-options" maxLength={200} value={wine.producer} onChange={e=>field('producer',e.target.value)}/></label>
 <label>Vintage<select value={wine.vintage??''} onChange={e=>field('vintage',e.target.value?+e.target.value:null)}><option value="">Non-vintage</option>{years.map(y=><option key={y}>{y}</option>)}</select></label>
 <label>Wine type<select value={wine.wine_type} onChange={e=>field('wine_type',e.target.value)}>{wineTypes.map(t=><option key={t}>{t}</option>)}</select></label>
 {(['country','region','grape_variety'] as const).map(k=><label key={k}>{k==='grape_variety'?'Grape variety':k==='country'?'Country':'Region'}<input list={`${k}-options`} maxLength={k==='grape_variety'?200:160} value={wine[k]} onChange={e=>field(k,e.target.value)}/></label>)}
 <label>Bottle size<select value={wine.bottle_size} onChange={e=>field('bottle_size',+e.target.value)}>{Array.from(new Set([187,375,500,750,1000,1500,3000,6000,wine.bottle_size])).sort((a,b)=>a-b).map(n=><option key={n} value={n}>{n} ml</option>)}</select></label>
 {editor.mode==='add'&&<label>Quantity · up to {MAX_ADD_BATCH} per save<input type="number" min={1} max={MAX_ADD_BATCH} step={1} required value={quantity} onChange={e=>changeQuantity(+e.target.value)}/></label>}
 <label>Personal rating<select value={rating??''} onChange={e=>setRating(e.target.value?+e.target.value:null)}><option value="">Not rated</option>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n} / 5</option>)}</select></label>
 <label className="wide">Personal notes<textarea maxLength={10000} value={notes} onChange={e=>setNotes(e.target.value)}/></label></div>
 <datalist id="producer-options">{suggestions('producer').map(s=><option key={s} value={s}/>)}</datalist><datalist id="country-options">{suggestions('country',commonCountries).map(s=><option key={s} value={s}/>)}</datalist><datalist id="region-options">{suggestions('region').map(s=><option key={s} value={s}/>)}</datalist><datalist id="grape_variety-options">{suggestions('grape_variety',commonGrapes).map(s=><option key={s} value={s}/>)}</datalist>
 {editor.mode==='add'&&duplicates>0&&<p className="warning">Matching producer, name and vintage: {duplicates} active {duplicates===1?'bottle':'bottles'}. You can add more or reuse the saved wine above.</p>}
 <details className="optional-fields"><summary>Tasting notes, bottle image & drinking window</summary><div className="form-grid"><label className="wide">Tasting notes<textarea maxLength={10000} value={wine.tasting_notes} onChange={e=>field('tasting_notes',e.target.value)}/></label><label className="wide">Bottle image URL (HTTPS)<input type="url" pattern="https://.*" maxLength={2048} value={wine.image_url??''} onChange={e=>field('image_url',e.target.value||null)}/></label>{(['drinking_window_start','drinking_window_end'] as const).map((k,i)=><label key={k}>{i===0?'Drinking window starts':'Drinking window ends'}<input type="number" min={1} max={9999} value={wine[k]??''} onChange={e=>field(k,e.target.value?+e.target.value:null)}/></label>)}</div><small>Only record a drinking window when you have a source. No dates are inferred.</small></details></>}
 {(editor.mode==='add'||editor.mode==='move')&&<div className="placements"><p className="muted">{available.length} available main rack positions. Bottom storage has no fixed capacity.</p>{(placements[0].location_type==='BOTTOM'?placements.slice(0,1):placements.slice(0,Math.min(quantity,180))).map((p,i)=><PositionPicker key={i} label={editor.mode==='move'?'Destination':placements[0].location_type==='BOTTOM'?`Bottom storage · ${quantity} ${quantity===1?'bottle':'bottles'}`:`Bottle ${i+1}`} value={p} available={available.filter(a=>!placements.some((other,j)=>j!==i&&other.location_type==='RACK'&&locationLabel(other)===locationLabel(a)))} onChange={next=>setPlacements(old=>{if(i===0&&next.location_type==='BOTTOM')return [bottom];if(i===0&&old[0].location_type==='BOTTOM'){const choices=available.slice(0,Math.min(quantity,180));return choices.length?choices:[bottom];}return old.map((o,j)=>j===i?next:o);})}/>)}</div>}
 </>}
 {error&&<p className="form-error" role="alert">{error}</p>}<div className="dialog-actions"><button className="secondary" type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="primary" disabled={busy}>{busy?<><LoaderCircle className="spin" size={15}/> Saving…</>:remove?`Confirm ${editor.mode}`:'Save to cellar'}</button></div></form>}
 </dialog>;
}
