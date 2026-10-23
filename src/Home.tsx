import BrandLogo from './BrandLogo';
import {useEffect,useRef,useState} from 'react';
import {useLocation,useNavigate} from 'react-router-dom';
import CellarReplay from './CellarReplay';
import {X,Wine,ChevronRight} from 'lucide-react';
import {positions,rack} from './rack';
import {useCellar} from './store';
import {locationLabel,type Placement,type Bottle} from './domain';
import BottleManager,{type Editor} from './BottleManager';
import CellarViewer from './CellarViewer';
import {useMobile} from './mobile';
import {useMobileEditor} from './mobile-editor';
import {firstOccupiedDepth,inventoryBottleUrl} from './bottle-navigation';
import {useSelectionReveal} from './useSelectionReveal';
export default function Home({reducedMotionOverride}:{reducedMotionOverride?:boolean}={}){
 const route=useLocation();const navigate=useNavigate();const stage=useRef<HTMLDivElement>(null);
 const mobile=useMobile(),mobileEditor=useMobileEditor();const [pickerRow,setPickerRow]=useState(1),[pickerColumn,setPickerColumn]=useState(1),[pickerDepth,setPickerDepth]=useState(1);
 const tap=useRef<ReturnType<typeof setTimeout>|null>(null);const cancelTap=()=>{if(tap.current)clearTimeout(tap.current);};useEffect(()=>cancelTap,[]);
 const swipe=useRef<{x:number;y:number}|null>(null);
 const params=new URLSearchParams(route.search),replayId=params.get('replay')==='1'?params.get('bottle'):null;
 const [replayBottle,setReplayBottle]=useState<Bottle|null>(null),[replayError,setReplayError]=useState('');
 const {bottles,ready,loading,error,sync,loadBottle}=useCellar();
 const [selected,setSelected]=useState<typeof positions[number]|'BOTTOM'|null>(null);
 const [depth,setDepth]=useState<number|null>(null);
 const [bottomId,setBottomId]=useState<string|null>(null),[selectionSerial,setSelectionSerial]=useState(0),[selectionError,setSelectionError]=useState('');
 const detailRef=useRef<HTMLDivElement>(null),routeHandled=useRef('');
 const [editor,setEditor]=useState<Editor|null>(null);
 const edit=(next:Editor)=>mobile?mobileEditor.open(next):setEditor(next);
 const closeRef=useRef<HTMLButtonElement>(null);
 const triggerRef=useRef<SVGRectElement|null>(null);
 function choose(p:typeof positions[number]|'BOTTOM',chosenDepth?:number){cancelTap();setSelectionError('');setSelected(p);setSelectionSerial(n=>n+1);setBottomId(p==='BOTTOM'&&mobile&&bottles.filter(b=>b.status==='In Cellar'&&b.location_type==='BOTTOM').length===1?bottles.find(b=>b.status==='In Cellar'&&b.location_type==='BOTTOM')!.id:null);setDepth(p==='BOTTOM'?null:chosenDepth??(mobile?firstOccupiedDepth(bottles,p.row,p.column):null));}
 function selectRack(p:typeof positions[number]|'BOTTOM',element:SVGRectElement,delay=false){const select=()=>{triggerRef.current=element;if(replayId)navigate('/',{replace:true});choose(p);};cancelTap();if(mobile&&delay)tap.current=setTimeout(select,330);else select();}
 function close(){cancelTap();setSelected(null);setDepth(null);setBottomId(null);triggerRef.current?.focus();}
 useEffect(()=>{if(selected)closeRef.current?.focus();},[selected]);
 useEffect(()=>{const key=route.key+route.search;if(routeHandled.current===key)return;cancelTap();if(replayId){setSelected(null);routeHandled.current=key;return;}const parameters=new URLSearchParams(route.search),id=parameters.get('bottle');if(id){if(!ready)return;routeHandled.current=key;const b=bottles.find(b=>b.id===id&&b.status==='In Cellar');if(!b){setSelectionError('This bottle is no longer in the active cellar.');return;}setSelectionSerial(n=>n+1);if(b.location_type==='BOTTOM'){setSelected('BOTTOM');setBottomId(b.id);setDepth(null);}else{setSelected(positions.find(p=>p.row===b.row_number&&p.column===b.column_number)!);setDepth(b.depth_number!-1);}return;}routeHandled.current=key;const address=parameters.get('location');if(address==='BOTTOM'){choose('BOTTOM');return;}const match=address?.match(/^R(\d+)-C(\d+)-D([1-3])$/);if(match){const p=positions.find(p=>p.row===+match[1]&&p.column===+match[2]);if(p)choose(p,+match[3]-1);}},[route.key,route.search,replayId,ready,bottles]);
 useEffect(()=>{let active=true;setReplayBottle(null);setReplayError('');if(!replayId||!ready)return;const bottle=bottles.find(b=>b.id===replayId);if(bottle){setReplayBottle(bottle);return;}void loadBottle(replayId).then(b=>{if(active){setReplayBottle(b);if(!b)setReplayError('This bottle could not be found.');}}).catch(()=>{if(active)setReplayError('Bottle details could not be loaded. Check your connection.');});return()=>{active=false;};},[replayId,ready,bottles,loadBottle]);
 const active=bottles.filter(b=>b.status==='In Cellar');
 const bottomBottles=active.filter(b=>b.location_type==='BOTTOM');
 const position:Placement|null=selected&&selected!=='BOTTOM'&&depth!==null?{location_type:'RACK',row_number:selected.row,column_number:selected.column,depth_number:depth+1}:null;
 const current=selected==='BOTTOM'?bottomBottles.find(b=>b.id===bottomId):position?active.find(b=>locationLabel(b)===locationLabel(position)):null;
 const revealKey=current?`${current.id}:${selectionSerial}`:null;
 const highlighted=useSelectionReveal(revealKey,mobile&&Boolean(current),()=>detailRef.current,reducedMotionOverride);
 const selectedDetails=current?<div ref={detailRef} tabIndex={-1} className={`position-detail ${highlighted?'selection-highlight':''}`} aria-label={`Selected bottle ${locationLabel(current)}`}><h2>{locationLabel(current)}</h2><div className="selected-wine-identity"><strong>{current.wine.producer||'Producer not recorded'}</strong><span>{current.wine.name}</span><span>{current.wine.vintage??'Non-vintage'}</span></div><div className="selection-actions"><button className="primary" onClick={()=>edit({mode:'details',bottle:current})}>View Bottle Details</button><button className="secondary" onClick={()=>navigate(inventoryBottleUrl(current.id))}>View in My Cellar</button></div></div>:null;
 return <main className="home" onKeyDown={e=>{if(e.key==='Escape'&&!editor)close();}}>
  {selectionError&&<aside className="replay-card" role="status">{selectionError}<button className="secondary" onClick={()=>{setSelectionError('');navigate('/',{replace:true});}}>Return to Full Cellar</button></aside>}
  {mobile&&!replayId&&<header className="mobile-cellar-heading"><BrandLogo className="brand-logo--small"/><h1>Your cellar</h1><p>Pinch to explore. Tap a rack to open it.</p></header>}
  <CellarViewer stage={stage} replaying={Boolean(replayId)} onManipulate={cancelTap}><img draggable={false} src={`${import.meta.env.BASE_URL}cellar.png`} alt="Glass-enclosed wine cellar with warm brass lighting, stone walls and five dark wine racks"/>
   <svg viewBox={`0 0 ${rack.width} ${rack.height}`} aria-label="Select a rack position" className="rack-overlay">
    {positions.map(p=><rect key={p.id} x={p.x} y={p.y} width={p.width} height={p.height} rx="9" role="button" tabIndex={0} aria-label={`Row ${p.row}, column ${p.column}; view three depths`} aria-pressed={selected!=='BOTTOM'&&selected?.id===p.id} className={selected!=='BOTTOM'&&selected?.id===p.id?'selected':''} onClick={e=>selectRack(p,e.currentTarget,true)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();triggerRef.current=e.currentTarget;if(replayId)navigate('/',{replace:true});choose(p);}}}><title>{p.id}</title></rect>)}
    <rect x={rack.bottom.x} y={rack.bottom.y} width={rack.bottom.width} height={rack.bottom.height} rx="9" role="button" tabIndex={0} aria-label="Bottom storage, separate from main racks" aria-pressed={selected==='BOTTOM'} className={selected==='BOTTOM'?'selected':''} onClick={e=>selectRack('BOTTOM',e.currentTarget,true)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();triggerRef.current=e.currentTarget;if(replayId)navigate('/',{replace:true});choose('BOTTOM');}}}><title>BOTTOM · Additional storage</title></rect>
   </svg>
  </CellarViewer>
  {mobile&&!replayId&&<div className="mobile-location-picker"><label>Row<select aria-label="Quick row" value={pickerRow} onChange={e=>setPickerRow(+e.target.value)}>{rack.rows.map((_,i)=><option key={i} value={i+1}>{i+1}</option>)}</select></label><label>Column<select aria-label="Quick column" value={pickerColumn} onChange={e=>setPickerColumn(+e.target.value)}>{rack.columns.map((_,i)=><option key={i} value={i+1}>{i+1}</option>)}</select></label><label>Depth<select aria-label="Quick depth" value={pickerDepth} onChange={e=>setPickerDepth(+e.target.value)}>{rack.depths.map((d,i)=><option key={d} value={i+1}>{d}</option>)}</select></label><button className="primary" onClick={()=>choose(positions.find(p=>p.row===pickerRow&&p.column===pickerColumn)!,pickerDepth-1)}>Open</button><button className="text-button picker-bottom" onClick={()=>choose('BOTTOM')}>Bottom storage <ChevronRight size={15}/></button></div>}
  {!replayId&&selected&&<aside className="rack-panel" aria-label={selected==='BOTTOM'?'Bottom storage':`${selected.id} rack details`}>
   {mobile&&<button className="sheet-handle" aria-label="Swipe down or tap to close rack details" onClick={close} onPointerDown={e=>{swipe.current={x:e.clientX,y:e.clientY};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerUp={e=>{if(swipe.current&&e.clientY-swipe.current.y>50&&Math.abs(e.clientX-swipe.current.x)<100)close();swipe.current=null;}}><span/></button>}<div className="panel-top"><span className="eyebrow">{selected==='BOTTOM'?'ADDITIONAL STORAGE':'RACK POSITION'}</span><button ref={closeRef} className="icon-button" onClick={close} aria-label="Close rack details"><X size={19}/></button></div>
   {selected==='BOTTOM'?<><h1>Bottom storage</h1><p className="muted">{ready?`${bottomBottles.length} bottles · Additional to the 180 rack positions`:'Loading bottles…'}</p><div className="bottom-list">{bottomBottles.map(b=><button className={`depth ${bottomId===b.id?'active':''}`} key={b.id} onClick={()=>{if(mobile){cancelTap();setBottomId(b.id);setSelectionSerial(n=>n+1);}else edit({mode:'details',bottle:b});}}><Wine size={18}/><span><strong>{b.wine.producer||'Producer not recorded'}</strong><small>{b.wine.name}</small><small>{b.wine.vintage??'Non-vintage'}</small></span><ChevronRight size={16}/></button>)}{ready&&!bottomBottles.length&&<p className="muted">No bottles stored here.</p>}</div>{selectedDetails}<button className="primary" disabled={!ready||loading} onClick={()=>edit({mode:'add',location:{location_type:'BOTTOM',row_number:null,column_number:null,depth_number:null}})}>Add to bottom storage</button></>:<><h1>Row {String(selected.row).padStart(2,'0')} <span> / </span> Column {selected.column}</h1><p className="muted">Select a depth to inspect its bottle position.</p>
   <div className="depths">{rack.depths.map((label,d)=>{const b=active.find(b=>b.location_type==='RACK'&&b.row_number===selected.row&&b.column_number===selected.column&&b.depth_number===d+1);return <button key={label} className={`depth ${depth===d?'active':''}`} onClick={()=>{cancelTap();setDepth(d);setSelectionSerial(n=>n+1);}}><span className="depth-number">0{d+1}</span><span><strong>{label}</strong><small>{ready?b?<><b>{b.wine.producer||'Producer not recorded'}</b><span>{b.wine.name}</span><span>{b.wine.vintage??'Non-vintage'}</span></>:`${selected.id}-D${d+1} · Available`:'Occupancy unknown'}</small></span><ChevronRight size={17}/></button>;})}</div>
   {selectedDetails}{depth!==null&&!current&&<div className="position-detail"><Wine size={30} strokeWidth={1}/><h2>{selected.id}-D{depth+1}</h2><p>{ready?'Available position':'Inventory unavailable'}</p><small>The bottles shown in the image are decorative.</small><button disabled={!ready||loading} className="primary" onClick={()=>current?edit({mode:'details',bottle:current}):position&&edit({mode:'add',location:position})}>{current?'View bottle details':'Add bottle'}</button></div>}</>}
   <div className="connection-note"><span>{error||`${sync}${loading?' · Refreshing…':''}`}</span></div>
  </aside>}
  {replayId&&replayBottle&&<CellarReplay key={replayId+locationLabel(replayBottle)} reducedMotionOverride={reducedMotionOverride} bottle={replayBottle} stage={stage} onExit={()=>navigate('/',{replace:true})} onDetails={()=>edit({mode:'details',bottle:replayBottle})}/>}
  {replayId&&!replayBottle&&<aside aria-busy={!replayError} className="replay-card"><p>{replayError||'Locating your bottle…'}</p><button className="secondary" onClick={()=>navigate('/',{replace:true})}>Return to Full Cellar</button></aside>}
  {editor&&<BottleManager key={JSON.stringify(editor)} editor={editor} onClose={()=>setEditor(null)} onChange={setEditor}/>}
 </main>;
}
