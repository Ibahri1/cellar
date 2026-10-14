// Development-only UI fixture. Not a Vite production entry and never deployed.
// No sample bottles, credentials, backend calls or successful fake saves.
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {HashRouter,Routes,Route,NavLink} from 'react-router-dom';
import {RotateCw} from 'lucide-react';
import {CellarContext} from '../src/store';
import Home from '../src/Home';
import Pages from '../src/pages';
import '../src/style.css';
import '../src/phase3.css';
const fixtures={session:null,initializing:false,loading:false,ready:true,error:'',notice:'',bottles:[],sync:'TEST ONLY — NO DATABASE',refresh:async()=>{},mutate:async()=>{throw Error('TEST ONLY — Database writes are disabled.');},logout:async()=>{}};
function TestUI(){const [menu,setMenu]=useState(false);return <HashRouter><CellarContext.Provider value={fixtures}><div style={{position:'fixed',top:0,left:0,zIndex:9999,fontSize:10,background:'#69552e',color:'white',padding:4}}>TEST ONLY · EMPTY UI FIXTURE · NO LOGIN OR DATABASE · NOT DEPLOYED</div><div className="rotate"><RotateCw/><h1>A wider view of your cellar.</h1><p>Please rotate your device to landscape.</p></div><div className="landscape"><button className="nav-toggle icon-button" aria-label="Test navigation" onClick={()=>setMenu(!menu)}>☰</button>{menu&&<nav className="navigation">{[['/','Home'],['/cellar','My Cellar'],['/statistics','Statistics'],['/history','History'],['/settings','Settings']].map(([path,label])=><NavLink key={path} to={path} onClick={()=>setMenu(false)}>{label}</NavLink>)}</nav>}<Routes><Route path="/" element={<Home/>}/>{[['/cellar','My Cellar'],['/statistics','Statistics'],['/history','History'],['/settings','Settings']].map(([path,label])=><Route key={path} path={path} element={<Pages section={label}/>}/>)}</Routes></div></CellarContext.Provider></HashRouter>}
createRoot(document.getElementById('test-root')!).render(<TestUI/>);
