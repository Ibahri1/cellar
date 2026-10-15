# Private Cellar — Firebase / GitHub Pages

The existing cellar website uses the official Firebase JavaScript SDK, Firebase Authentication and Cloud Firestore. It is designed for **Firebase Spark** and remains a static GitHub Pages site at **https://ibahri1.github.io/cellar/**, with source intended for **https://github.com/Ibahri1/cellar**. These upgrades change local source only. No external account, repository, DNS record, cloud database or deployment was modified.

Landscape layouts, navigation, login, inventory, search and the dark/gold styling are preserved. `public/cellar.png` is the exact new supplied image, verified by SHA-256, with twelve visible rack rows and bottom storage. `src/rack.ts` contains individually calibrated row bands and column widths in the image's 1536 × 1024 coordinate space. The same geometry drives clicking and camera targeting; existing R1-C1-D1 through R12-C5-D3 IDs and BOTTOM assignments are unchanged.

## Upgrades

- **Show in Cellar:** active bottle details open a roughly three-second column/row tracking and camera zoom replay. Skip Animation, Return to Full Cellar and reduced-motion support are included. A bottle-ID hash URL survives refresh and uses its current saved location. Middle/Back have explicit depth indicators and share the visible rack target; BOTTOM highlights the whole shared area.
- **Bottle Price ($):** optional individual `bottles.priceCents`, stored as safe nonnegative integer USD cents. Blank means “Not specified”; zero is a valid price. Editing, moving, Drank and Gifted preserve the price. No valuations or financial statistics were added.
- **Wine Type:** free text with optional suggestions, trimmed before saving, accepted by filters and statistics. Drinking-window inputs/details are removed. Older wines with those fields remain readable and unchanged; editing creates a new wine revision without them. No migration/backfill/reset is needed.
- **Scan Wine Label:** lazy-loaded Tesseract.js runs OCR entirely on the device. Explicit field labels, high-confidence standalone grape names, unambiguous vintage lines and bottle sizes can fill the form. Unknown/ambiguous fields are left unchanged; a new form starts blank. This is English text recognition, not a wine database or AI identification service. Decorative fonts, curved labels, glare, small print and non-English labels often require manual entry. Review every result before saving. Raw recognized text is available for review, with progress/cancel and failure messages.
- **Take Photo / Upload Photo:** JPG, PNG and WebP inputs support device-camera capture where available and a file-picker fallback. Photos are resized to at most 640 pixels on the long edge, converted to JPEG, stripped of original metadata and bounded to 110,000 data-URL characters (about 80 KiB of JPEG). Preview, replace and remove are available; nothing is uploaded until the bottle save succeeds. HEIC is not supported—export it to JPG first.

### Private photos on Spark

Cloud Storage for Firebase now requires Blaze ([official FAQ](https://firebase.google.com/docs/storage/faq-and-troubleshooting)). This implementation does not enable it. Instead, **small thumbnails only** are saved in separate UID-protected immutable `photos` Firestore documents, atomically with the bottle and history. Large original images never enter Firestore. This is suitable for a small personal cellar within [Firestore's free quotas](https://firebase.google.com/docs/firestore/quotas); image documents consume the same storage, read/write and bandwidth allowances as other Firestore data. Monitor Usage, especially with many BOTTOM bottles or repeated photo replacements.

The photo payload field is exempt from indexing. Thumbnails load only when visible and are cached in memory for the session; they are not downloaded with every inventory update. A replacement creates a new photo document and removing a photo detaches it. Prior thumbnail documents remain private and retained, avoiding destructive cleanup; repeated replacements consume additional storage. Full-resolution albums would need separately authorized storage configuration.

Saved thumbnails are shared persistent Firestore data and designed to appear across authenticated devices. This was verified with two independent **local emulator clients**, not the live Firebase project or physical devices. Cloud synchronization requires deploying the updated rules and index exemption to the existing project first, with explicit authorization. No new Firebase configuration values are needed.

OCR workers, WASM cores and English language data are copied from installed packages by `scripts/prepare-ocr.mjs` during `npm run dev` and `npm run build`. All are served from this website; no scan photos are sent to recognition APIs or CDNs. The OCR chunk loads only when scanning; its engine/language assets take several MB on first use. The browser may cache language data in IndexedDB. Added dependencies: `tesseract.js@7.0.0` (runtime) and `@tesseract.js-data/eng@1.0.0` (build/test language data). The [upstream local-installation guide](https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md) describes these self-hosted paths.

## Local use

Use Node.js 22.18+ or 24:

```sh
npm ci
npm run dev
```

Copy `.env.example` to `.env`, fill in the six **public** Firebase values described below, and restart Vite. Without configuration, the existing login card displays a setup message and disables login. There is no fake local inventory or browser-only password gate.

`npm run build` checks TypeScript and creates `dist`; `npm run preview` serves that production build. HashRouter and relative Vite base `./` keep assets and page refreshes compatible with `/cellar/` and future custom domains. `/tests/ui.html` on the development server is a clearly labeled empty UI fixture that cannot save; `?fixtures=1#/cellar` enables explicitly labeled synthetic bottles for replay testing and `?fixtures=1&reduce=1#/?bottle=test-middle&replay=1` tests reduced motion. Fixtures are not included in `dist`.

## Firebase setup — do these steps only when ready to configure the cloud project

1. Use the **existing Firebase project and Web app**; do not create a replacement or reset data. Confirm it remains on Spark. Keep the existing administrator account and password-only login. Do not enable Analytics, Cloud Functions, Cloud Storage, extensions or other services for this website. The following account/database steps are references for an installation not yet configured; skip steps already completed.
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
| `wines` | Immutable normalized wine records/revisions; custom wine type and legacy HTTPS image URLs/windows remain readable |
| `bottles` | Individual bottle records; optional `priceCents`/`photoId`, `wineId`, coordinates, location key, status, notes/rating, timestamps, version and last activity ID |
| `photos` | Private immutable compressed JPEG thumbnails, referenced by individual bottles; unindexed `dataUrl` |
| `positions` | Deterministic `R1-C1-D1` reservation IDs, each linked to exactly one active rack bottle |
| `activityHistory` | Immutable Added/Edited/Moved/Drank/Gifted events with wine snapshot, locations, bottle version and retry hash |
| `outcomes` | One immutable record per removed bottle; enables count queries for Drank/Gifted without downloading archived bottles |
| `settings` | Fixed rack dimensions/capacity; BOTTOM is additional |

UI field names are adapted at the data boundary so the existing forms and business logic remain intact. BOTTOM records use `locationType: "BOTTOM"`, `locationKey: "BOTTOM"` and null row/column/depth; no reservation document is needed. There is no total BOTTOM capacity constraint.

All related changes use a Firestore transaction. Rules use `getAfter()` to require the corresponding history and reservation state, validate coordinates against the deterministic location ID, forbid reservation overwrites, require release of an old rack reservation and require an outcome when a bottle is removed. Bottles and history cannot be deleted through the app. Wines and outcomes are immutable. Unknown fields/collections, unsupported statuses, changed creation timestamps, invalid coordinates and direct edits that skip history are denied.

Edits create a wine revision for only the selected bottle. Other bottles and old history retain their original details. Version checks reject stale edits or removal confirmations; stable request/bottle/history IDs make an unchanged retry idempotent. Drank/Gifted remain confirmed UI actions, preserve the dated bottle record and free the rack location. A failed atomic save leaves no partial inventory/history/reservation changes.

**Per-save limit: three bottles, or one when attaching a new photo.** This bounds rules' document access calls below Firestore's transaction limits, including all validation. Add further batches for larger quantities. This is not a fixed capacity for BOTTOM or a change to the 180-slot main rack. The UI explains the limit before saving.

The upgraded local rules accept optional integer `priceCents`, optional private `photoId`, and arbitrary nonblank wine-type strings up to 160 characters. They permit legacy window keys without requiring them. Move/removal updates cannot alter price/photo fields. The existing administrator UID restriction, reservations, version checks and atomic history requirements remain. **Do not publish rules until explicitly authorized.** Preserve the existing project's administrator UID when applying this file; never substitute a test UID. Deploy rules/indexes before the frontend, then smoke-test the existing account and legacy bottles. No data migration is required.

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

Tests cover correct/incorrect password, UID rejection, logout, anonymous/unrelated-user denial, unknown collections, a three-rack transaction, 183 additional BOTTOM bottles, atomic rollback, idempotency, simultaneous occupancy attempts, stale edits, all movement directions, Drank/Gifted records, history tampering, missing history/reservations, invalid coordinates, collection listener updates, history pagination and settings validation. Upgrade tests cover integer prices, optional prices, legacy documents, custom types, photo privacy/persistence, invalid prices/photos, conservative OCR on readable/blank fixtures, all 180 target addresses and separate capacity calculations.

Browser checks use clearly labeled synthetic fixtures: first/middle/last rows across five columns, Front/Middle/Back and BOTTOM replay, Skip, Return, refreshed replay URLs, reduced motion, desktop/mobile landscape, portrait guard, custom type/price entry, absent window fields, JPEG preview/removal and readable/blank label OCR. Camera file-input capture is implemented but physical camera permissions/hardware were not tested.

**Not live-tested:** hosted Firebase credentials, production rules/index deployment, real cloud persistence, physical-device synchronization and actual GitHub Pages deployment. Verify those after authorized deployment. The image map is calibrated to the supplied image; it does not change existing physical inventory assignments.

The runtime dependency audit is checked separately with `npm audit --omit=dev`. A compatible patched gRPC override addresses the Firebase SDK's Node transport advisory. The development-only Firebase CLI dependency tree still reports upstream advisories; it is not bundled into `dist`. Do not apply `npm audit fix --force` blindly or downgrade the SDK to resolve CLI-only warnings. Review/update test tooling as upstream fixes become available.

Advanced AI wine identification and full-resolution photo storage are not implemented. External wine lookup, advanced recommendations and import/export reports remain outside these upgrades. No paid Firebase service or wine API is used. No existing cloud data was migrated or deleted.

## Files changed in these upgrades

- Updated `public/cellar.png`, `src/rack.ts`, `src/Home.tsx`; added `src/CellarReplay.tsx`, `src/upgrades.css` and `public/THIRD_PARTY_OCR.txt` with bundled OCR license copies.
- Updated `src/BottleManager.tsx`, `src/pages.tsx`, `src/domain.ts`, `src/firestore.ts`, `src/store.tsx`, `src/main.tsx`.
- Added `src/BottlePhoto.tsx`, `src/PhotoEditor.tsx`, `src/photos.ts`, `src/LabelScanner.tsx`, `src/label.ts` and `scripts/prepare-ocr.mjs`.
- Updated `firestore.rules`, `firestore.indexes.json`, `package.json`, `package-lock.json`, `.gitignore` and this guide.
- Updated `tests/domain.test.mjs`, `tests/firebase.test.mjs`, `tests/ui.tsx`; added `tests/upgrades.test.mjs` and synthetic `tests/fixtures` images. Existing login/configuration/workflow files are preserved.

Official references: [Firebase password authentication](https://firebase.google.com/docs/auth/web/password-auth), [Auth session persistence](https://firebase.google.com/docs/auth/web/auth-state-persistence), [atomic writes and rules](https://firebase.google.com/docs/firestore/manage-data/transactions), [rules conditions and limits](https://firebase.google.com/docs/firestore/security/rules-conditions), [Spark pricing](https://firebase.google.com/pricing), [Emulator Suite](https://firebase.google.com/docs/emulator-suite/install_and_configure).
