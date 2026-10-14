import {initializeApp} from 'firebase/app';
import {browserSessionPersistence,initializeAuth,type Auth} from 'firebase/auth';
import {authenticateAdmin} from './auth';
import {initializeFirestore,memoryLocalCache,type Firestore} from 'firebase/firestore';

export const adminEmail=import.meta.env.VITE_FIREBASE_ADMIN_EMAIL?.trim()??'';
export const adminUid=import.meta.env.VITE_FIREBASE_ADMIN_UID?.trim()??'';
const options={apiKey:import.meta.env.VITE_FIREBASE_API_KEY?.trim(),authDomain:import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim(),projectId:import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim(),appId:import.meta.env.VITE_FIREBASE_APP_ID?.trim()};
let authInstance:Auth|null=null,dbInstance:Firestore|null=null;
if(Object.values(options).every(Boolean)&&adminEmail&&adminUid){
 try{
  const app=initializeApp(options);
  authInstance=initializeAuth(app,{persistence:browserSessionPersistence});
  // Wine records are never written to localStorage or a persistent offline cache.
  dbInstance=initializeFirestore(app,{localCache:memoryLocalCache()});
 }catch{/* Missing/invalid public setup is shown on the existing login screen. */}
}
export const auth=authInstance;
export const db=dbInstance;
export async function loginWithPassword(password:string){
 if(!auth)throw Error('Firebase is not configured.');
 await authenticateAdmin(auth,adminEmail,password,adminUid);
}
