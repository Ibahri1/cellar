import React, { Suspense, lazy, useEffect, useState } from 'react';
import {createRoot} from 'react-dom/client';
import {HashRouter, NavLink, Route, Routes, useLocation} from 'react-router-dom';
import {Menu, X, Wine, LayoutGrid, Search, ChartNoAxesCombined, History, Settings, ArrowLeft, ChevronRight, RotateCw, LogOut} from 'lucide-react';
import {CellarProvider,useCellar} from './store';
import Login from './Login';
import Home from './Home';
import MobileShell from './MobileShell';
import {useMobile} from './mobile';
import './style.css';
import './phase3.css';
import './upgrades.css';
import './mobile.css';
const Secondary = lazy(() => import('./pages'));
const links = [{to:'/',label:'Home',icon:Wine},{to:'/cellar',label:'My Cellar',icon:LayoutGrid},{to:'/search',label:'Search',icon:Search},{to:'/statistics',label:'Statistics',icon:ChartNoAxesCombined},{to:'/history',label:'History',icon:History},{to:'/settings',label:'Settings',icon:Settings}];

function App(){const mobile=useMobile();const [menu,setMenu]=useState(false);const location=useLocation();const {session,initializing,sync,logout,error,notice}=useCellar();useEffect(()=>setMenu(false),[location]);return <><div className="rotate"><RotateCw size={40} strokeWidth={1}/><h1>A wider view of your cellar.</h1><p>Please rotate your device to landscape.</p></div><div className="landscape">{initializing?<div className="loading">Opening your cellar…</div>:!session?<Login/>:<MobileShell><button className="nav-toggle icon-button" aria-label={menu?'Close navigation':'Open navigation'} aria-expanded={menu} onClick={()=>setMenu(!menu)}>{menu?<X size={21}/>:<Menu size={21}/>}</button>{menu&&<><button className="scrim" aria-label="Close navigation" onClick={()=>setMenu(false)}/><nav className="navigation" aria-label="Main navigation"><div className="brand"><Wine size={25} strokeWidth={1}/><span>PRIVATE CELLAR<small>A place for every bottle.</small></span></div>{links.map(({to,label,icon:Icon})=><NavLink end key={to} to={to}><Icon size={18} strokeWidth={1.5}/>{label}<ChevronRight className="nav-arrow" size={14}/></NavLink>)}<button className="logout-button" onClick={()=>void logout()}><LogOut size={16}/> Logout</button><div className="nav-footer">{error||sync}</div></nav></>}<Suspense fallback={<div className="loading">Opening your cellar…</div>}><Routes><Route path="/" element={<Home/>}/>{links.slice(1).map(l=><Route key={l.to} path={l.to} element={<Secondary section={l.label}/>}/>)}<Route path="*" element={<div className="page"><h1>Page not found</h1><NavLink to="/"><ArrowLeft/> Return to cellar</NavLink></div>}/></Routes></Suspense>{notice&&!mobile&&<div className="sr-only" role="status">{notice}</div>}</MobileShell>}</div></>};
createRoot(document.getElementById('root')!).render(<React.StrictMode><HashRouter><CellarProvider><App/></CellarProvider></HashRouter></React.StrictMode>);
