import {useSyncExternalStore} from 'react';
export const mobileQuery='(max-width: 767px), (max-width: 900px) and (orientation: portrait), (max-width: 1023px) and (max-height: 500px), (min-width: 1000px) and (max-width: 1366px) and (orientation: landscape)';
const subscribe=(change:()=>void)=>{const media=window.matchMedia(mobileQuery);media.addEventListener('change',change);return()=>media.removeEventListener('change',change);};
export function useMobile(){return useSyncExternalStore(subscribe,()=>window.matchMedia(mobileQuery).matches,()=>false);}
