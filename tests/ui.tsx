// Development-only UI fixture. Not a Vite production entry and never deployed.
// Optional clearly marked synthetic bottles exercise replay; never a live cellar.
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {HashRouter,Routes,Route,NavLink} from 'react-router-dom';
import {RotateCw} from 'lucide-react';
import {CellarContext} from '../src/store';
import Home from '../src/Home';
import Pages from '../src/pages';
import '../src/style.css';
import '../src/phase3.css';
import '../src/upgrades.css';
import type {Bottle} from '../src/domain';
const demonstration=new URLSearchParams(window.location.search).has('fixtures');
const reducedMotion=new URLSearchParams(window.location.search).has('reduce');
const sampleWine={id:'test-wine',name:'TEST ONLY Cabernet',producer:'TEST FIXTURE',vintage:2021,wine_type:'Custom Red Blend',country:'France',region:'Bordeaux',grape_variety:'Cabernet Sauvignon',bottle_size:750,tasting_notes:'TEST DATA',image_url:null};
const demoBottles:Bottle[]=demonstration?[
 {id:'test-front',row_number:1,column_number:1,depth_number:1,location_type:'RACK'},
 {id:'test-middle',row_number:7,column_number:3,depth_number:2,location_type:'RACK'},
 {id:'test-back',row_number:12,column_number:5,depth_number:3,location_type:'RACK'},
 {id:'test-bottom',row_number:null,column_number:null,depth_number:null,location_type:'BOTTOM'}
].map(b=>({...b,location_type:b.location_type as 'RACK'|'BOTTOM',wine_id:'test-wine',wine:sampleWine,status:'In Cellar',personal_rating:null,personal_notes:'TEST ONLY',version:1,created_at:'2026-10-14T00:00:00Z',removed_at:null,price_cents:1999,photo_id:null})):[];
const fixtures={session:null,initializing:false,loading:false,ready:true,error:'',notice:'',bottles:demoBottles,totals:{drank:0,gifted:0},sync:'TEST ONLY — NO DATABASE',refresh:async()=>{},mutate:async()=>{throw Error('TEST ONLY — Database writes are disabled.');},logout:async()=>{},loadBottle:async(id:string)=>demoBottles.find(b=>b.id===id)??null,loadPhoto:async()=>null};
function TestUI(){const [menu,setMenu]=useState(false);return <HashRouter><CellarContext.Provider value={fixtures}><div style={{position:'fixed',top:0,left:0,zIndex:9999,fontSize:10,background:'#69552e',color:'white',padding:4}}>TEST ONLY · SYNTHETIC UI FIXTURE · NO LOGIN OR DATABASE · NOT DEPLOYED</div><div className="rotate"><RotateCw/><h1>A wider view of your cellar.</h1><p>Please rotate your device to landscape.</p></div><div className="landscape"><button className="nav-toggle icon-button" aria-label="Test navigation" onClick={()=>setMenu(!menu)}>☰</button>{menu&&<nav className="navigation">{[['/','Home'],['/cellar','My Cellar'],['/statistics','Statistics'],['/history','History'],['/settings','Settings']].map(([path,label])=><NavLink key={path} to={path} onClick={()=>setMenu(false)}>{label}</NavLink>)}</nav>}<Routes><Route path="/" element={<Home reducedMotionOverride={reducedMotion?true:undefined}/>}/>{[['/cellar','My Cellar'],['/statistics','Statistics'],['/history','History'],['/settings','Settings']].map(([path,label])=><Route key={path} path={path} element={<Pages section={label}/>}/>)}</Routes></div></CellarContext.Provider></HashRouter>}
createRoot(document.getElementById('test-root')!).render(<TestUI/>);
