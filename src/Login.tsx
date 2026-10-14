import {useState, type FormEvent} from 'react';
import {Eye,EyeOff,LockKeyhole,LoaderCircle,Wine} from 'lucide-react';
import {auth,loginWithPassword} from './firebase';
export default function Login(){
 const [password,setPassword]=useState(''),[visible,setVisible]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function login(e:FormEvent){e.preventDefault();if(!auth||busy)return;setBusy(true);setError('');
  try{
   await loginWithPassword(password);setPassword('');
  }catch{setError('Unable to sign in. Check the password and connection, then try again.');}
  finally{setBusy(false);}
 }
 return <main className="login-page"><form className="login-panel" onSubmit={login}><Wine size={38} strokeWidth={1}/><span className="eyebrow">PRIVATE CELLAR</span><h1>Welcome to your cellar.</h1><p>Administrator access</p><label htmlFor="admin-password">Password</label><div className="password-field"><LockKeyhole size={17}/><input id="admin-password" type={visible?'text':'password'} autoComplete="current-password" required maxLength={1024} value={password} onChange={e=>setPassword(e.target.value)} disabled={!auth||busy}/><button type="button" aria-label={visible?'Hide password':'Show password'} aria-pressed={visible} onClick={()=>setVisible(!visible)}>{visible?<EyeOff size={18}/>:<Eye size={18}/>}</button></div>{error&&<p className="form-error" role="alert">{error}</p>}{!auth&&<p className="setup-message">Cloud setup required. Configure Firebase Authentication and Firestore before signing in.</p>}<button className="primary" disabled={!auth||busy}>{busy?<><LoaderCircle className="spin" size={16}/> Verifying…</>:'Login'}</button><small>Your collection, securely kept.</small></form></main>;
}
