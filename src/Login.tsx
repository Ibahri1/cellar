import {useState, type FormEvent} from 'react';
import {Eye,EyeOff,LockKeyhole,LoaderCircle,Wine} from 'lucide-react';
import {client} from './store';
export default function Login(){
 const [password,setPassword]=useState(''),[visible,setVisible]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function login(e:FormEvent){e.preventDefault();if(!client||busy)return;setBusy(true);setError('');
  try{
   const response=await fetch(`${import.meta.env.VITE_SUPABASE_URL.trim().replace(/\/+$/,'')}/functions/v1/admin-login`,{method:'POST',headers:{'Content-Type':'application/json','apikey':import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY.trim()},body:JSON.stringify({password})});
   const data=await response.json();
   if(!response.ok){setError(response.status===401?'Incorrect administrator password.':response.status===429?'Too many attempts. Please try again in 15 minutes.':response.status===403?'Administrator access is not configured for this website.':'Login is unavailable. Check the server setup and try again.');return;}
   const {error:failure}=await client.auth.setSession({access_token:data.access_token,refresh_token:data.refresh_token});
   if(failure)throw failure;setPassword('');
  }catch{setError('Unable to verify login. Check your connection and Supabase setup.');}
  finally{setBusy(false);}
 }
 return <main className="login-page"><form className="login-panel" onSubmit={login}><Wine size={38} strokeWidth={1}/><span className="eyebrow">PRIVATE CELLAR</span><h1>Welcome to your cellar.</h1><p>Administrator access</p><label htmlFor="admin-password">Password</label><div className="password-field"><LockKeyhole size={17}/><input id="admin-password" type={visible?'text':'password'} autoComplete="current-password" required maxLength={1024} value={password} onChange={e=>setPassword(e.target.value)} disabled={!client||busy}/><button type="button" aria-label={visible?'Hide password':'Show password'} aria-pressed={visible} onClick={()=>setVisible(!visible)}>{visible?<EyeOff size={18}/>:<Eye size={18}/>}</button></div>{error&&<p className="form-error" role="alert">{error}</p>}{!client&&<p className="setup-message">Cloud setup required. Configure Supabase and deploy the secure login function before signing in.</p>}<button className="primary" disabled={!client||busy}>{busy?<><LoaderCircle className="spin" size={16}/> Verifying…</>:'Login'}</button><small>Your collection, securely kept.</small></form></main>;
}
