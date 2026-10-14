import {useEffect,useRef,useState} from 'react';
import {useLocation} from 'react-router-dom';
import {X,Wine,ChevronRight} from 'lucide-react';
import {positions,rack} from './rack';
import {useCellar} from './store';
import {locationLabel,type Placement} from './domain';
import BottleManager,{type Editor} from './BottleManager';
export default function Home(){
 const route=useLocation();
 const {bottles,ready,loading,error,sync}=useCellar();
 const [selected,setSelected]=useState<typeof positions[number]|'BOTTOM'|null>(null);
 const [depth,setDepth]=useState<number|null>(null);
 const [editor,setEditor]=useState<Editor|null>(null);
 const closeRef=useRef<HTMLButtonElement>(null);
 const triggerRef=useRef<SVGRectElement|null>(null);
 function close(){setSelected(null);setDepth(null);triggerRef.current?.focus();}
 useEffect(()=>{if(selected)closeRef.current?.focus();},[selected]);
 useEffect(()=>{const address=new URLSearchParams(route.search).get('location');if(address==='BOTTOM'){setSelected('BOTTOM');setDepth(null);return;}const match=address?.match(/^R(\d+)-C(\d+)-D([1-3])$/);if(match){const p=positions.find(p=>p.row===+match[1]&&p.column===+match[2]);if(p){setSelected(p);setDepth(+match[3]-1);}}},[route.search]);
 const active=bottles.filter(b=>b.status==='In Cellar');
 const bottomBottles=active.filter(b=>b.location_type==='BOTTOM');
 const position:Placement|null=selected&&selected!=='BOTTOM'&&depth!==null?{location_type:'RACK',row_number:selected.row,column_number:selected.column,depth_number:depth+1}:null;
 const current=position?active.find(b=>locationLabel(b)===locationLabel(position)):null;
 return <main className="home" onKeyDown={e=>{if(e.key==='Escape'&&!editor)close();}}>
  <div className="cellar-stage"><img src={`${import.meta.env.BASE_URL}cellar.png`} alt="Glass-enclosed wine cellar with warm brass lighting, stone walls and five dark wine racks"/>
   <svg viewBox={`0 0 ${rack.width} ${rack.height}`} aria-label="Select a rack position" className="rack-overlay">
    {positions.map(p=><rect key={p.id} x={p.x} y={p.y} width={p.width} height={p.height} rx="9" role="button" tabIndex={0} aria-label={`Row ${p.row}, column ${p.column}; view three depths`} aria-pressed={selected!=='BOTTOM'&&selected?.id===p.id} className={selected!=='BOTTOM'&&selected?.id===p.id?'selected':''} onClick={e=>{triggerRef.current=e.currentTarget;setSelected(p);setDepth(null);}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();triggerRef.current=e.currentTarget;setSelected(p);setDepth(null);}}}><title>{p.id}</title></rect>)}
    <rect x={rack.bottom.x} y={rack.bottom.y} width={rack.bottom.width} height={rack.bottom.height} rx="9" role="button" tabIndex={0} aria-label="Bottom storage, separate from main racks" aria-pressed={selected==='BOTTOM'} className={selected==='BOTTOM'?'selected':''} onClick={e=>{triggerRef.current=e.currentTarget;setSelected('BOTTOM');setDepth(null);}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();triggerRef.current=e.currentTarget;setSelected('BOTTOM');setDepth(null);}}}><title>BOTTOM · Additional storage</title></rect>
   </svg>
  </div>
  {selected&&<aside className="rack-panel" aria-label={selected==='BOTTOM'?'Bottom storage':`${selected.id} rack details`}>
   <div className="panel-top"><span className="eyebrow">{selected==='BOTTOM'?'ADDITIONAL STORAGE':'RACK POSITION'}</span><button ref={closeRef} className="icon-button" onClick={close} aria-label="Close rack details"><X size={19}/></button></div>
   {selected==='BOTTOM'?<><h1>Bottom storage</h1><p className="muted">{ready?`${bottomBottles.length} bottles · Additional to the 180 rack positions`:'Loading bottles…'}</p><div className="bottom-list">{bottomBottles.map(b=><button className="depth" key={b.id} onClick={()=>setEditor({mode:'details',bottle:b})}><Wine size={18}/><span><strong>{b.wine.name}</strong><small>{b.wine.vintage??'NV'} · {b.wine.producer}</small></span><ChevronRight size={16}/></button>)}{ready&&!bottomBottles.length&&<p className="muted">No bottles stored here.</p>}</div><button className="primary" disabled={!ready||loading} onClick={()=>setEditor({mode:'add',location:{location_type:'BOTTOM',row_number:null,column_number:null,depth_number:null}})}>Add to bottom storage</button></>:<><h1>Row {String(selected.row).padStart(2,'0')} <span> / </span> Column {selected.column}</h1><p className="muted">Select a depth to inspect its bottle position.</p>
   <div className="depths">{rack.depths.map((label,d)=>{const b=active.find(b=>b.location_type==='RACK'&&b.row_number===selected.row&&b.column_number===selected.column&&b.depth_number===d+1);return <button key={label} className={`depth ${depth===d?'active':''}`} onClick={()=>setDepth(d)}><span className="depth-number">0{d+1}</span><span><strong>{label}</strong><small>{ready?b?`${b.wine.name} · ${b.wine.vintage??'NV'}`:`${selected.id}-D${d+1} · Available`:'Occupancy unknown'}</small></span><ChevronRight size={17}/></button>;})}</div>
   {depth!==null&&<div className="position-detail"><Wine size={30} strokeWidth={1}/><h2>{selected.id}-D{depth+1}</h2><p>{ready?current?current.wine.name:'Available position':'Inventory unavailable'}</p><small>{current?`${current.wine.producer} · ${current.wine.vintage??'NV'}`:'The bottles shown in the image are decorative.'}</small><button disabled={!ready||loading} className="primary" onClick={()=>current?setEditor({mode:'details',bottle:current}):position&&setEditor({mode:'add',location:position})}>{current?'View bottle details':'Add bottle'}</button></div>}</>}
   <div className="connection-note"><span>{error||`${sync}${loading?' · Refreshing…':''}`}</span></div>
  </aside>}
  {editor&&<BottleManager key={JSON.stringify(editor)} editor={editor} onClose={()=>setEditor(null)} onChange={setEditor}/>}
 </main>;
}
