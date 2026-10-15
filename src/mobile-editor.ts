import {createContext,useContext} from 'react';
import type {Editor} from './BottleManager';
export const MobileEditorContext=createContext<{open:(editor:Editor)=>void}>({open:()=>{throw Error('Mobile editor provider missing');}});
export const useMobileEditor=()=>useContext(MobileEditorContext);
