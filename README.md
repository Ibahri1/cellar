# Private Cellar — Firebase / GitHub Pages

The existing cellar website now uses the official Firebase JavaScript SDK, Firebase Authentication and Cloud Firestore. It is designed for **Firebase Spark** and remains a static GitHub Pages site at **https://ibahri1.github.io/cellar/**, with source intended for **https://github.com/Ibahri1/cellar**. No external account, repository, DNS record, cloud database or deployment was modified during this migration.

The cellar image, landscape-only layouts, navigation, rack overlay, panels, inventory forms, search and dark/gold styling are preserved. There are 180 main rack positions and separate full-width BOTTOM storage. The twelve logical rack bands still need physical calibration because the unchanged image shows eleven clearly distinguishable horizontal rows; adjust `src/rack.ts` without changing the image.

## Local use

Use Node.js 22.18+ or 24:

```sh
npm ci
npm run dev
```

Copy `.env.example` to `.env`, fill in the six **public** Firebase values described below, and restart Vite. Without configuration, the existing login card displays a setup message and disables login. There is no fake local inventory or browser-only password gate.

`npm run build` checks TypeScript and creates `dist`; `npm run preview` serves that production build. HashRouter and relative Vite base `./` keep assets and page refreshes compatible with `/cellar/` and future custom domains. `/tests/ui.html` on the development server is a clearly labeled empty UI fixture that cannot save; it is not included in `dist`.

## Firebase setup — do these steps only when ready to configure the cloud project

1. Create or select your Firebase project and confirm it is on the **Spark plan with no billing account attached**. Register a Web app, leaving Firebase Hosting unchecked. Do not enable Analytics, Cloud Functions, Cloud Storage, extensions or other services for this website.
2. Enable Authentication → Sign-in method → **Email/Password**. Do not enable email-link login. In Authentication → Users, manually create one administrator account. Set a strong password directly in Firebase Console or your password manager; never place it in code, `.env`, shell arguments, GitHub variables or documentation. The website exposes no signup, registration, email, username, forgot-password or account-management interface.
3. Copy that user's **UID** and account email. Replace the literal `REPLACE_WITH_ADMIN_UID` in `firestore.rules` with the UID. It is a public identifier, not a password. The frontend UID below must match it exactly. The rules deny all real users until this is configured.
4. Create the **default Cloud Firestore database, Standard edition, in production mode**. Choose a suitable region for your devices. Do not use public test-mode rules. Publish the supplied `firestore.rules` and `firestore.indexes.json` to that project when you authorize cloud deployment. Keep the default deny rule for unknown collections.
5. In Firebase Authentication → Settings → Authorized domains, add `ibahri1.github.io` (domain only, no `/cellar/` path). Add your localhost development domain when needed, and your actual custom domain only after it is assigned. Retain the project's Firebase Auth domain. The supplied `authDomain` should be the project's Firebase auth domain, not the GitHub Pages URL.
6. Copy `.env.example` to `.env` and enter the Web app's public configuration and the two administrator identifiers:

```text
VITE_FIREBASE_API_KEY=YOUR_WEB_APP_API_KEY
VITE_FIREBASE_AUTH_DOMAIN=YOUR_PROJECT_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID=YOUR_PROJECT_ID
VITE_FIREBASE_APP_ID=YOUR_WEB_APP_APP_ID
VITE_FIREBASE_ADMIN_EMAIL=YOUR_PRECREATED_ADMIN_EMAIL
VITE_FIREBASE_ADMIN_UID=YOUR_PRECREATED_ADMIN_UID
```

These are public browser settings. **There is no password variable.** Do not add service-account keys, private keys or Admin SDK credentials to the frontend. The real administrator password goes only into the password field and Firebase's standard `signInWithEmailAndPassword` call. Login and session restoration both check the UID; Firestore rules independently enforce that same UID for every read/write.

7. Optionally create `settings/cellar` once with exactly these integer fields (the app also keeps the matching rack constants in code):

```json
{"rackRows":12,"rackColumns":5,"rackDepth":3,"rackCapacity":180}
```

If using Firebase CLI after explicitly approving cloud changes, authenticate to your intended project, then deploy **only** Firestore configuration:

```sh
npx firebase deploy --only firestore:rules,firestore:indexes --project YOUR_PROJECT_ID
```

No Firebase Hosting, Functions or Storage configuration exists in `firebase.json`. Do not run an unrelated deployment target. Test actual login, live persistence and two physical devices before relying on the collection. Local emulator success does not prove your hosted project is configured correctly.

## Required GitHub Actions variables

Under repository Settings → Secrets and variables → Actions → **Variables**, add these six values:

| Variable | Value |
| --- | --- |
| `VITE_FIREBASE_API_KEY` | Firebase Web app API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase project's Auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID |
| `VITE_FIREBASE_APP_ID` | Registered Firebase Web app ID |
| `VITE_FIREBASE_ADMIN_EMAIL` | Pre-created administrator email |
| `VITE_FIREBASE_ADMIN_UID` | Same administrator UID as in `firestore.rules` |

The existing official Pages Actions workflow now reads these variables. Remove obsolete backend variables from your repository settings yourself when ready; the build no longer reads them. Set repository Pages Source to GitHub Actions. A main-branch push triggers deployment, so **do not push/deploy until authorized**. `.env` files are ignored. No domain was supplied; a future custom domain can use Pages settings plus `public/CNAME`, with DNS configured separately by you.

## Firestore structure and integrity

| Collection | Purpose |
| --- | --- |
| `wines` | Immutable normalized wine records/revisions; camelCase fields, optional HTTPS image URL and recorded drinking window |
| `bottles` | Individual bottle records; `wineId`, coordinates, location key, exact status, notes/rating, timestamps, version and last activity ID |
| `positions` | Deterministic `R1-C1-D1` reservation IDs, each linked to exactly one active rack bottle |
| `activityHistory` | Immutable Added/Edited/Moved/Drank/Gifted events with wine snapshot, locations, bottle version and retry hash |
| `outcomes` | One immutable record per removed bottle; enables count queries for Drank/Gifted without downloading archived bottles |
| `settings` | Fixed rack dimensions/capacity; BOTTOM is additional |

UI field names are adapted at the data boundary so the existing forms and business logic remain intact. BOTTOM records use `locationType: "BOTTOM"`, `locationKey: "BOTTOM"` and null row/column/depth; no reservation document is needed. There is no total BOTTOM capacity constraint.

All related changes use a Firestore transaction. Rules use `getAfter()` to require the corresponding history and reservation state, validate coordinates against the deterministic location ID, forbid reservation overwrites, require release of an old rack reservation and require an outcome when a bottle is removed. Bottles and history cannot be deleted through the app. Wines and outcomes are immutable. Unknown fields/collections, unsupported statuses, changed creation timestamps, invalid coordinates and direct edits that skip history are denied.

Edits create a wine revision for only the selected bottle. Other bottles and old history retain their original details. Version checks reject stale edits or removal confirmations; stable request/bottle/history IDs make an unchanged retry idempotent. Drank/Gifted remain confirmed UI actions, preserve the dated bottle record and free the rack location. A failed atomic save leaves no partial inventory/history/reservation changes.

**Per-save limit: three bottles.** This bounds rules' document access calls below Firestore's transaction limits, including all validation. Add further batches for larger quantities. This is not a fixed capacity for BOTTOM or a change to the 180-slot main rack. The UI explains the limit before saving.

Rules secure client operations; project owners, Admin SDK/server credentials and Firebase Console can bypass them. Do not use privileged tools to rewrite bottle/reservation/history documents independently. Such external edits are outside the client's integrity guarantees. No privileged credentials are used in this website.

## Synchronization, performance and free-plan behavior

- One collection-level listener tracks active bottles. Referenced immutable wines are fetched once and cached in memory for the session. No per-rack subscriptions or polling.
- History has its own paginated listener only while the History page is open. Later pages use stable timestamp/document-ID cursors; a new first-page event resets pagination. Archived bottle details load only when requested.
- Drank/Gifted totals use server aggregation queries over `outcomes` at initial load, removal events and explicit refresh. Ordinary inventory use does not download historical bottles or history.
- Only server-confirmed snapshots update inventory. Transactions require connectivity; offline operations fail visibly rather than silently queuing inventory writes. An open tab can display its last confirmed inventory with an offline label, and Firestore reconnects automatically.
- Firebase Auth uses standard session persistence within the tab. Wine inventory has no persistent disk/localStorage cache. Auth refresh and logout use the SDK, with no custom tokens, hashes, server password gate or old eight-hour session policy.
- Spark quotas still apply to document reads/writes, rule lookups, stored history and listeners. Reconnects/refreshes can cause reads. Exhausted quotas are shown as errors; the project never enables billing automatically. Use Firebase's Usage dashboard to monitor them.
- Firebase's built-in password protections apply. There is no custom global throttle or Cloud Function. The internal email/UID and Web app configuration are public, as requested; rules, not configuration secrecy, protect inventory. Other Auth accounts—even if created through Firebase's APIs—cannot read this cellar unless they have the exact authorized UID.

## Tests and verification

```sh
npm test
# Requires Java 21+ on PATH; starts/stops only local Auth and Firestore emulators:
npm run test:rules
npm run build
```

The emulator suite uses the fixed **demo-private-cellar** project and refuses to run without loopback emulator hosts. Fixture accounts/passwords are local test data, not real credentials or a proposed administrator password. No Firebase login or live project is needed. The CLI may download the official Firestore emulator on first use; Java is only a development/test requirement, not a website runtime dependency.

Tests cover correct/incorrect password, UID rejection, logout, anonymous/unrelated-user denial, unknown collections, a three-rack transaction, 183 additional BOTTOM bottles, atomic rollback, idempotency, simultaneous occupancy attempts, stale edits, all movement directions, Drank/Gifted records, history tampering, missing history/reservations, invalid coordinates, collection listener updates, history pagination and settings validation. Existing domain tests cover all 180 logical rack addresses and separate capacity calculations. Browser checks use the unchanged landscape/portrait interface and clearly labeled empty UI fixture.

**Not live-tested:** hosted Firebase credentials, production rules/index deployment, real cloud persistence, physical-device synchronization and actual GitHub Pages deployment. Verify those after cloud setup. Calibrate the logical row bands against the physical cellar before entering real bottle locations.

The runtime dependency audit is checked separately with `npm audit --omit=dev`. A compatible patched gRPC override addresses the Firebase SDK's Node transport advisory. The development-only Firebase CLI dependency tree still reports upstream advisories; it is not bundled into `dist`. Do not apply `npm audit fix --force` blindly or downgrade the SDK to resolve CLI-only warnings. Review/update test tooling as upstream fixes become available.

External wine lookup, label recognition, advanced recommendations and import/export reports remain outside this migration. No paid Firebase service or wine API is used. No existing cloud data was migrated or deleted; the prior project had no supplied cloud configuration. Obsolete backend source, tests, packages and build variables were removed locally; existing Git history retains the previous implementation if needed.

## Files changed

- Added `src/firebase.ts`, `src/auth.ts`, `src/firestore.ts` for modular Firebase configuration, authentication and transactions/data mapping.
- Replaced `src/store.tsx` integration; updated `src/Login.tsx`, `src/pages.tsx`, `src/domain.ts`, and the quantity guidance in `src/BottleManager.tsx`.
- Added `firestore.rules`, `firestore.indexes.json`, `firebase.json`, and emulator tests; updated the existing UI fixture.
- Updated `.env.example`, `.gitignore`, `package.json`, lockfile, `.github/workflows/pages.yml`, SDK chunk caching in `vite.config.ts`, and this guide.
- Removed the obsolete database migration, Edge Function, backend config and backend-only tests/dependencies. Preserved `public/cellar.png`, `src/Home.tsx`, rack mapping, styles and routing.

Official references: [Firebase password authentication](https://firebase.google.com/docs/auth/web/password-auth), [Auth session persistence](https://firebase.google.com/docs/auth/web/auth-state-persistence), [atomic writes and rules](https://firebase.google.com/docs/firestore/manage-data/transactions), [rules conditions and limits](https://firebase.google.com/docs/firestore/security/rules-conditions), [Spark pricing](https://firebase.google.com/pricing), [Emulator Suite](https://firebase.google.com/docs/emulator-suite/install_and_configure).
