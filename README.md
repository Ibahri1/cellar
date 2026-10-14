# Private Cellar — Phase 3

The existing React/TypeScript/Vite static site now includes password-only administrator login, Supabase inventory operations, a separate BOTTOM storage region, searchable inventory, basic statistics and persistent activity history. The cellar image is unchanged. No external account, repository, DNS record or deployment has been modified.

**Cloud status:** implementation is prepared locally. No Supabase project or credentials were supplied, so real password verification, hosted migrations, cloud persistence and two-device synchronization have not been verified. Without configuration, the production interface displays a setup message and disabled login; it does not substitute local inventory or a browser-only password check.

## Run locally

Use Node.js 22.18+ or 24. From this directory:

```sh
npm ci
npm run dev
```

Open the printed localhost URL. `npm run build` checks TypeScript and builds `dist`; `npm run preview` serves it. `npm test` runs the embedded PostgreSQL/RLS and login-handler tests without any cloud accounts. PGlite is a development-only dependency and is not bundled into the website.

For layout checks before cloud setup, `/tests/ui.html` on the **development server only** is clearly labeled TEST ONLY. It uses an empty collection, cannot save, does not bypass production authentication, and is not included in `dist`. Test code does not contain real credentials or sample inventory presented as real.

## Rack mapping

Main rack: **12 rows × 5 columns × 3 depths = 180 positions**. Rows run top to bottom, columns left to right. Locations are `R1-C1-D1` through `R12-C5-D3`. `BOTTOM` is a single full-width target beneath the racks with no row/column/depth or fixed bottle capacity. Every bottom bottle still has a unique database record. Counts and capacity calculations keep bottom storage separate.

**Calibration remains required.** The image shows eleven clearly distinguishable horizontal bottle rows. `src/rack.ts` therefore explicitly defines twelve *logical* bands inside the rack zone; it does not claim twelve perfectly aligned visible shelves. Adjust each row/column rectangle against the physical cellar. The image is preserved, not regenerated or stretched. Row 12 no longer includes the bottom shelf. Settings explains this limitation.

## Supabase setup — perform only when you approve cloud changes

Use a dedicated Supabase project. The migration creates two narrowly scoped Postgres roles and one shared collection; it is not intended to be applied blindly to an unrelated existing database. Review the migration before executing it. The project uses standard Supabase Auth sessions, with the password entered only in the login form and verified server-side.

### 1. Provision the administrator securely

In Supabase Dashboard → Authentication, create **one confirmed email/password user**. Enter a strong random administrator password directly in the secure Dashboard form (prefer a password manager). Do not put that password in code, shell arguments, `.env`, logs, GitHub variables or documentation. Supabase Auth stores a salted bcrypt verifier; this project never stores a plaintext password. Keep within the password length supported by your Auth configuration. Disable public signups, anonymous sign-in and unused authentication providers. Set the access-token lifetime to about 15 minutes; keep refresh-token rotation enabled.

The website asks only for a password. The account email is configured on the server as `ADMIN_EMAIL`. As explicitly accepted for this project, standard authenticated Supabase sessions expose their subject UUID and let a session holder retrieve their account email from Auth; that identity is not a second secret. The password and backend database credential remain private.

### 2. Apply the migration and authorize that identity

The local migration is `supabase/migrations/20261014003753_cellar_inventory.sql`. Apply it once using the Dashboard SQL editor, or link the CLI and push the migration after reviewing the target project. The migration enables RLS, explicitly grants client SELECT privileges, restricts writes to the mutation RPC, and adds `activity_history` to `supabase_realtime`.

After applying it, run this in the private Dashboard SQL editor, replacing the placeholder with the administrator's Authentication user UUID:

```sql
insert into private.admin_access(singleton,user_id)
values (true,'YOUR_ADMIN_AUTH_USER_UUID'::uuid);
```

Do not add `private` to the exposed Data API schemas. Keep public tables under RLS. There are no anonymous inventory reads/writes, public user administration or financial fields.

### 3. Configure the restricted login database role

The login function uses a direct/pooler connection only for login throttling and registering the standard Auth session. It does **not** use a service-role key. `cellar_login` cannot read or modify wine inventory. Enable login for this role in the SQL editor:

```sql
alter role cellar_login login connection limit 5;
```

Connect with `psql` as your project administrator over TLS and run the interactive command `\password cellar_login`. Enter a strong **separate database role password** when prompted; never reuse the cellar administrator password. This keeps the role password out of command arguments and shell history. If using another trusted database client, use its secure role-password interface.

Use the project's transaction pooler host from Dashboard → Connect. The connection string for the Edge Function uses the restricted role, e.g.:

```text
postgresql://cellar_login.PROJECT_REF:URL_ENCODED_ROLE_PASSWORD@YOUR_POOLER_HOST:6543/postgres
```

Use your actual pooler host and project reference; TLS is required by the function. `prepare:false` supports transaction pooling. Test connectivity with the restricted role. Do not use the `postgres` database password or a service-role/secret API key in this connection string.

### 4. Set server secrets and deploy the login function

Copy `supabase/functions/.env.example` to the ignored `supabase/functions/.env`. Fill in:

- `ADMIN_EMAIL`: the internal confirmed Auth user's email.
- `AUTH_PUBLISHABLE_KEY`: the project's public publishable key.
- `LOGIN_DATABASE_URL`: the restricted role's TLS pooler connection string.
- `ALLOWED_ORIGINS`: exact permitted frontend origins, comma separated; include `http://127.0.0.1:5173` for local testing and the real production origin when assigned. No URL paths or trailing slashes. A repository Pages site uses `https://USERNAME.github.io` as its origin.

There is deliberately **no admin-password environment variable**. `SUPABASE_URL` is provided automatically to hosted Edge Functions. Set these secrets through the Dashboard's Edge Function secrets interface or the CLI using the ignored env file. Deploy `supabase/functions/admin-login/index.ts` as `admin-login`. The checked-in `config.toml` sets `verify_jwt=false` for this **login endpoint only** because it must receive unauthenticated password submissions. Its handler independently checks origins, enforces the database rate limit and calls Supabase Auth. It fails closed if any server configuration is missing.

The login function permits at most ten password attempts per 15-minute window across the shared cellar. This simple global limiter avoids depending on spoofable IP headers and needs no paid rate-limit service. A deliberate attacker can temporarily exhaust that window; review this tradeoff before publishing. Supabase's own Auth limits also apply. Direct Auth sessions are not authorized for cellar access until the restricted login function registers them, so calling Auth directly cannot bypass the cellar login throttle to gain data access.

If using the CLI, after explicitly approving these cloud changes and authenticating it, the verified command sequence is:

```sh
supabase link --project-ref YOUR_PROJECT_REF
supabase db push --dry-run
supabase db push
# Complete steps 2–3 above (administrator UUID and restricted role password).
supabase secrets set --env-file supabase/functions/.env
supabase functions deploy admin-login --use-api
```

Use interactive credential prompts rather than password flags. If you already applied the migration through the SQL editor, do not also push it as a new migration without reconciling migration history. The function deployment uses the checked-in `verify_jwt=false` setting; do not turn off validation on protected inventory operations.

### 5. Configure the frontend

Copy `.env.example` to `.env`, then populate only:

```text
VITE_SUPABASE_URL=YOUR_PROJECT_URL
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_PUBLISHABLE_KEY
```

Restart Vite after changing env files. For GitHub Pages builds, add those same two public values as repository **variables** (the existing workflow reads `vars.*`). Never put the admin password, internal email, restricted DB connection string or Supabase secret/service-role key in a `VITE_` variable. Do not commit any real `.env` file. Only the frontend's public settings are embedded in its build.

## Inventory and security behavior

- Add individual bottles in one atomic batch; rack destinations must be unique and available, while multiple bottles can share BOTTOM. Saved wines can be reused, and matching producer/name/vintage is flagged.
- Edit creates an immutable wine revision for that bottle so other bottles and previous history keep their original information. Personal ratings/notes are editable.
- Move between rack positions and bottom storage. A partial unique index protects active rack occupancy even when devices race.
- Drank/Gifted require explicit UI confirmation, free the active position, preserve the bottle and record the removal date.
- `version` checks reject stale edits and stale removal confirmations. A request UUID makes retrying the same save idempotent. A failed batch rolls back wines, bottles, history and its request record together.
- Authenticated clients cannot write tables directly or alter/delete history. The public RPC delegates to a private function owned by a dedicated NOLOGIN writer role with RLS still enforced. Only the narrow private authorization/session lookup functions run with elevated privileges; execute grants are restricted and search paths fixed.
- Every protected query/write requires the configured administrator UUID, a registered login session, a live `auth.sessions` row and an eight-hour maximum session age. Logout revokes the current device session. Other devices keep their own sessions. The UI clears expired inventory; RLS remains authoritative.
- Standard Auth tokens persist in `sessionStorage` for refreshes within the tab; wine data is kept only in memory. Closing the tab normally ends that local persistence. Browser-accessible session tokens carry the usual XSS risk for static SPAs; no third-party scripts or custom token signing are introduced.
- One Realtime channel listens for the shared cellar's history inserts. Every mutation writes history, so one debounced refresh updates inventory and statistics. Reconnect, focus and successful saves also refresh; there is no polling or per-rack subscription. History loads on demand in cursor-based pages.
- Network errors are visible and a save is never reported successful until the RPC confirms it. Retry an unconfirmed request with the same unchanged form to reuse its request UUID. Closing an unconfirmed form loses that in-memory request key; inspect refreshed inventory before starting a new addition.

## Verification and remaining setup

Local tests exercise actual PostgreSQL constraints and RLS using PGlite, including all 180 rack slots, more than 180 bottom bottles, rollback, idempotency, stale versions, history, revoked/expired sessions and restricted-role throttling. Login-handler unit tests mock Auth/DB and cover success, wrong password, rate limit, bad origin, oversized input and server failures. They do not replace a hosted authentication test.

Before using real inventory, verify in your configured project:

1. Correct/incorrect password login, throttling, refresh and logout. Confirm a direct Auth login without registration cannot read inventory.
2. Anonymous and unrelated-user REST reads/writes are denied; private schemas remain unexposed. Run Supabase Security Advisors and resolve findings before production.
3. Add rack and multiple bottom bottles, refresh/close/reopen, and check cloud persistence.
4. Open two independently logged-in devices. Add, edit, move and remove bottles on each; verify live updates and recovery after offline/focus changes.
5. Attempt the same destination and edit version from both devices. Confirm one succeeds, the conflicting operation fails, and no partial history or overwritten bottle remains.
6. Calibrate all twelve logical rows against the physical cellar, check mobile/tablet landscape layouts and portrait rotation, then verify the production Pages hash URLs refresh correctly.

Not implemented in this phase: external wine lookup, label recognition, CSV import/export, PDF reports or advanced recommendations. No paid service or external wine API is used. Bottom storage has no logical capacity limit; actual Supabase storage, query and function quotas still apply. The shared snapshot loads all bottle records and immutable wine data for this personal cellar; very large long-term inventories may need further pagination/archiving.

## GitHub Pages and custom domain

The existing `.github/workflows/pages.yml` is preserved. Place this project's contents at your authorized repository root; select Settings → Pages → GitHub Actions. A push to main triggers its build/deployment. **Do not push/deploy until you authorize it.** The frontend remains static: no continuously running Node server, SSR or backend routes. Relative Vite base `./` and HashRouter support repository subpaths and custom domains. Tests and server source are not in `dist`.

No domain was supplied. When chosen, set it in Pages settings and add `public/CNAME` containing that domain. A subdomain uses a DNS CNAME to `USERNAME.github.io` with no repository path. An apex domain uses GitHub's current documented A/AAAA or supported ALIAS/ANAME records. Verify ownership, wait for DNS and enable HTTPS. Add the final frontend origin to `ALLOWED_ORIGINS` and update Supabase site URLs. No DNS changes are automated.

References: [Supabase password security](https://supabase.com/docs/guides/auth/password-security), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits), [Realtime changes](https://supabase.com/docs/guides/realtime/postgres-changes), [GitHub custom domains](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site).
