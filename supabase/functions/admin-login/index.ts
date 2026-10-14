import { createClient } from 'npm:@supabase/supabase-js@2.99.1';
import postgres from 'npm:postgres@3.4.7';

// No service-role key, plaintext password storage, or custom session issuance.
const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map(s => s.trim()).filter(Boolean);
const databaseUrl = Deno.env.get('LOGIN_DATABASE_URL');
const sql = databaseUrl ? postgres(databaseUrl, { max: 1, prepare: false, ssl: 'require', idle_timeout: 20, connect_timeout: 10 }) : null;

Deno.serve(async (request: Request) => {
  const origin = request.headers.get('origin') ?? '';
  const headers = { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Cache-Control': 'no-store' };
  const reply = (status: number, message: string, retry = false) => Response.json({ error: message },
    { status, headers: { ...headers, ...(retry ? {'Retry-After': '900'} : {}) } });
  if (!allowedOrigins.includes(origin)) return new Response('Forbidden', {status: 403});
  if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers});
  if (request.method !== 'POST') return reply(405, 'Method not allowed.');
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('AUTH_PUBLISHABLE_KEY');
  const email = Deno.env.get('ADMIN_EMAIL');
  if (!sql || !url || !key || !email) return reply(503, 'Administrator login is not configured.');
  try {
    // Bound streamed payload size even when Content-Length is missing or forged.
    const reader = request.body?.getReader();
    if (!reader) return reply(400, 'Enter the administrator password.');
    let length = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const {value,done} = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 4096) { await reader.cancel(); return reply(413, 'Request is too large.'); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
    let body: {password?: unknown};
    try { body = JSON.parse(new TextDecoder().decode(bytes)); }
    catch { return reply(400, 'Enter the administrator password.'); }
    if (typeof body?.password !== 'string' || !body.password || body.password.length > 1024)
      return reply(400, 'Enter the administrator password.');
    const [rate] = await sql`select private.consume_login_attempt() as allowed`;
    if (!rate?.allowed) return reply(429, 'Too many login attempts. Try again in 15 minutes.', true);
    const auth = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
    // Supabase Auth stores/verifies the salted bcrypt hash. Email stays server-side
    // during login; standard authenticated sessions may reveal account identity.
    const {data,error} = await auth.auth.signInWithPassword({email,password:body.password});
    body.password = undefined;
    if (error || !data.session) return reply(error?.status === 429 ? 429 : 401,
      error?.status === 429 ? 'Too many login attempts. Please try later.' : 'Incorrect administrator password.');
    const tokenBody = data.session.access_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
    const sessionId = JSON.parse(atob(tokenBody)).session_id;
    const [authorized] = await sql`select private.authorize_login(${sessionId}::uuid,${data.user.id}::uuid) as allowed`;
    if (!authorized?.allowed) { await auth.auth.signOut({scope:'local'}); return reply(403,'Administrator access has not been enabled.'); }
    const {data: valid, error: validityError} = await auth.rpc('cellar_session_valid');
    if (validityError || !valid) { await auth.auth.signOut({scope:'local'}); return reply(403,'Administrator access has not been enabled.'); }
    const {access_token, refresh_token, expires_at, token_type} = data.session;
    return Response.json({access_token,refresh_token,expires_at,token_type},{headers});
  } catch {
    // Fail closed; never log the password, auth response or database connection URL.
    return reply(503,'Login is temporarily unavailable. Please try again.');
  }
});
