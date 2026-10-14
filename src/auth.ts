import {signInWithEmailAndPassword,signOut,type Auth} from 'firebase/auth';
export async function authenticateAdmin(auth:Auth,email:string,password:string,uid:string){
 const result=await signInWithEmailAndPassword(auth,email,password);
 if(result.user.uid!==uid){await signOut(auth);throw Error('Administrator access denied.');}
 return result.user;
}
