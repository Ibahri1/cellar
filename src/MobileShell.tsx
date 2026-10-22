import BrandLogo from './BrandLogo';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {NavLink,useLocation} from 'react-router-dom';
import {Menu,X,Plus} from 'lucide-react';
import BottleManager,{type Editor} from './BottleManager';
import {useCellar} from './store';
import {useMobile} from './mobile';
import {MobileEditorContext} from './mobile-editor';
export default function MobileShell({children}:{children:ReactNode}){
 const mobile=useMobile(),location=useLocation(),{ready,notice,logout}=useCellar();const [editor,setEditor]=useState<Editor|null>(null),[menu,setMenu]=useState(false);const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>setMenu(false),[location.pathname]);
 useEffect(()=>{if(menu)dialog.current?.showModal();return()=>dialog.current?.close();},[menu]);
 useEffect(()=>{const viewport=window.visualViewport;const update=()=>{document.documentElement.style.setProperty('--visual-height',`${viewport?.height??window.innerHeight}px`);document.documentElement.style.setProperty('--visual-top',`${viewport?.offsetTop??0}px`);};update();viewport?.addEventListener('resize',update);viewport?.addEventListener('scroll',update);return()=>{viewport?.removeEventListener('resize',update);viewport?.removeEventListener('scroll',update);};},[]);
 return <MobileEditorContext.Provider value={{open:setEditor}}>{children}{mobile&&<><button className="compact-hamburger icon-button" aria-label="Open mobile navigation" aria-expanded={menu} onClick={()=>setMenu(true)}><Menu size={21}/></button>{notice&&<div className="mobile-toast" role="status">{notice}</div>}{menu&&<dialog ref={dialog} className="compact-menu" aria-label="Mobile navigation" onCancel={()=>setMenu(false)}><div className="panel-top"><BrandLogo className="brand-logo--small"/><button className="icon-button" aria-label="Close mobile navigation" onClick={()=>setMenu(false)}><X size={18}/></button></div><nav>{[['/','Home'],['/cellar','My Cellar'],['/search','Search'],['/statistics','Statistics'],['/history','Activity History'],['/cellar-history','Cellar History'],['/settings','Settings']].map(([to,label])=><NavLink end key={to} to={to} onClick={()=>setMenu(false)}>{label}</NavLink>)}</nav><div className="button-row"><button className="primary" disabled={!ready} onClick={()=>{setMenu(false);setEditor({mode:'add'});}}><Plus size={16}/>Add Bottle</button><button className="secondary" onClick={()=>{setMenu(false);void logout();}}>Sign out</button></div></dialog>}</>}{editor&&<BottleManager key={JSON.stringify(editor)} editor={editor} onClose={()=>setEditor(null)} onChange={setEditor}/>}</MobileEditorContext.Provider>;
}
