# BAHRI | Private Wine Cellar

An existing React / TypeScript / Vite / Tailwind website using Firebase Authentication, Cloud Firestore and GitHub Pages. Repository: https://github.com/Ibahri1/cellar. Website: https://ibahri1.github.io/cellar/. Firebase project: `cellar-784b2` (Spark). These upgrades are local only: no push, cloud writes, deployment, credential changes or destructive migration was performed.

## Implemented upgrades

- Compact mobile landscape layouts with a hamburger menu for Home, My Cellar, Search, Statistics, Activity History, Cellar History and Settings. The bottom navigation is removed. Forms use three columns, internal scrolling, 44px save controls and VisualViewport height/offset handling. Desktop styling is retained.
- A native top-layer rotation dialog blocks portrait interaction on touch devices, with the requested message and phone/rotation icons. Rotation preserves mounted pages, forms and selections. Tall ordinary desktop windows are not restricted. The UI fixture offers an explicit `device=phone` switch for simulated orientation testing; production relies on touch capability and physical screen orientation, with media-query fallback.
- Save validation is explicit rather than relying on native HTML validation to dispatch the submit handler. Required identification fields, vintage, quantity, price and positions produce visible errors. Photo processing and saving have visible busy states. A synchronous submission guard and stable request IDs prevent duplicate saves. Failures retain the draft. Success appears only after a confirmed database transaction.
- Optional **Purchased From** on each bottle; trimmed and limited to 200 characters, editable, persisted and shown only when populated.
- Producer precedes Wine Name in add/edit forms. Presets sort by locale-aware, case-insensitive Producer, Wine Name and ascending vintage (non-vintage first; missing producers last).
- The six standard bottle sizes are exactly **187mL, 375mL, 750mL, 1L, 1.5L, 3L**. A shared formatter preserves numeric mL storage. An existing uncommon size is retained and shown as one explicitly labeled existing-size option; it is never silently converted.
- Preset default prices populate additions. A successful addition updates that default atomically; canceling or an unrelated bottle edit does not. Prices remain integer USD cents and existing bottle prices are never retroactively changed.
- Preset photos are shared by stable preset IDs. Upload, replacement and removal require confirmation when changing an existing wine's shared photo. Every linked bottle uses the latest configured shared photo, including bottles that have older individual photo references. Old photo documents are retained. Legacy photos retain their individual display until a shared photo is explicitly configured; ambiguous legacy photos are not guessed or silently promoted.
- **Swap Positions** supports a searchable bottle list and a clickable cellar image with depth selection. Empty destinations offer Move Bottle. Confirmation identifies both bottles and before/after locations. Rack/rack and rack/BOTTOM changes are atomic, version checked and recorded. BOTTOM/BOTTOM swaps have no meaningful coordinate change and are rejected.
- Rack depth previews show Producer, Wine Name and Vintage, associated with their depth. Missing producer/year information is labeled honestly.
- Label scanning, OCR utilities/UI, Tesseract dependencies, generated engine/language assets, build preparation and OCR-only fixtures/styles are removed. Normal camera/photo upload, compression, previews and private Firestore thumbnails remain.
- **Cellar History** provides named manual snapshots, grouped automatic snapshots, pagination, read-only previews, conflict/skipped-bottle reports and confirmed position-only restoration with a committed safety backup and resumable progress.
- The original BAHRI artwork, cellar image, rack geometry, authentication, prices, activity history, Show in Cellar replay and 30-second inactivity screensaver remain. Forms, active operations, replay and the portrait gate pause the screensaver; the inline snapshot naming form pauses only when focused.

## Save-button investigation and limits of the finding

The inspected form previously used native `required` validation with no application-level invalid handler. That can prevent `onSubmit` from running while an offscreen required field is invalid, which appears to be an unresponsive save. Mobile forms also placed a sticky footer inside a long scrolling form and reserved space for fixed bottom navigation. The new form has explicit validation and a separate scrolling field area above a fixed flex footer, and the bottom bar is removed.

Browser checks demonstrated visible validation, a tappable save button, failed-save recovery, retained form values across rotation, and a visible 44px save button at both 844x390 and a shortened 844x230 viewport. This establishes fixes for those observed failure paths. It does **not** conclusively reproduce every intermittent failure on the user's physical phone. Real iOS/Android keyboards, camera permissions and the hosted administrator session still need device testing after authorized deployment. No live Firebase save is claimed as tested.

## Firestore schema and security

Existing collections remain: `wines`, `bottles`, `positions`, `activityHistory`, `outcomes`, `photos`, `settings`. Authentication and the explicit administrator UID restriction remain unchanged. No anonymous/private-data access or permissive wildcard was added.

| Collection | New or changed fields / purpose |
| --- | --- |
| `bottles` | Optional `purchasedFrom`, optional `presetId` (legacy fallback: `wineId`). Existing cents, individual photo IDs and all other metadata are preserved. |
| `wines` | Optional immutable `presetId` retains preset identity when an edited wine is copied, matching the existing immutable-wine architecture. |
| `winePresets/{presetId}` | `id`, nullable integer `defaultPriceCents`, nullable `photoId`, `photoConfigured`, server `updatedAt`. Shared defaults are separate from immutable wine details and per-bottle prices. |
| `cellarState/current` | `revision`, compact active bottle-ID-to-location `layout`, nullable restore `lock`, `changeIds`, `lastChangeId`, server `updatedAt`. Serializes occupancy changes and coordinates restores. |
| `cellarSnapshots/{id}` | Immutable `id`, `name`, `type` (Manual, Automatic, Safety), `schemaVersion: 1`, compact `layout`, `revision`, server `createdAt`. No photos or wine documents are duplicated. |
| `cellarChanges/{requestId}` | Immutable automatic-group `groupId`, `revision`, compact changed bottle locations (null for removal), `createdAt`. Committed with the inventory operation. |
| `cellarRestores/{id}` | Immutable restore plan and `safetyId`; validated sequential `index`, Running/Complete status and server timestamps. A persisted recovery job, not a browser-only timer. |
| `activityHistory` | Adds `Swapped` and `Restored` actions; existing records remain immutable and readable. |

The position-only schema maps each active bottle ID to its rack key or BOTTOM. Under schema version 1, the rack is exactly 12x5x3; every omitted rack address is empty. BOTTOM is represented by every bottle ID mapped to BOTTOM, without invented individual physical coordinates.

Rules validate optional fields, photo existence, preset prices, reservation releases/reassignment, bottle versions, timestamps and linked history. Every inventory mutation advances the shared revision; occupancy changes must have a matching immutable change record. Journal values must match the committed layout. Restore writes must match the current locked plan step. Snapshots, journal entries, old history and photos cannot be updated or deleted. Occupied reservations can be reassigned only when both affected bottle records prove the coordinated move.

No new composite query indexes are required. `firestore.indexes.json` retains the existing activity-history index and adds indexing exemptions for `cellarState.layout`, `cellarSnapshots.layout`, `cellarChanges.changes` and `cellarRestores.steps`. Existing thumbnail/note exemptions are retained.

### Compatibility / initialization

No production migration script is necessary or provided. The first upgraded layout operation lazily creates the new coordination document from confirmed active bottle records, rechecking those records in a transaction. It does not rewrite existing bottles, positions, photographs or history. Old bottles without new optional fields remain readable and editable. Existing uncommon bottle capacities remain unchanged.

Old browser clients cannot perform uncoordinated inventory writes under the new rules. Deploy rules and frontend together during a quiet period and refresh all open devices afterwards. Do not run the old client during a restoration, and do not blindly roll back to rules that lack the new fields and coordination checks. No cloud initialization was executed during development.

## Automatic grouping and restore protocol

Automatic snapshots use fixed five-minute client-clock buckets. The first occupancy change in a bucket commits one immutable full-layout base; later changes commit immutable revision deltas to that logical snapshot. The rules also bound appends to five minutes after base creation. There is no delayed browser flush: each completed change already has a durable recovery record, even if the browser closes immediately. Device clocks should be accurate. Manual and safety snapshots are independent of automatic groups.

A preview compares the selected layout to current active inventory and its revision. Missing/consumed/gifted references are skipped and identified as a partial restoration. Newer bottles are preserved. An unrelated occupant at a required destination blocks confirmation; move it explicitly and preview again. No bottle is recreated or deleted.

Before applying a restore, a separate immutable **Before Restore** snapshot is durably committed. A second transaction verifies its revision and acquires the restore lock. The persisted plan then moves one bottle per atomic step, recording history and automatic recovery changes. Cycles explicitly stage involved bottles in BOTTOM before placing them; unrelated bottles are never moved. Each step keeps bottle records and reservations consistent and uses a stable request ID. Other inventory writes are blocked during the job. The final step releases the lock.

If interrupted, open **Cellar History**, refresh and choose **Resume restoration**. Progress survives refresh/device changes. Do not remove the lock or modify job documents manually. The safety snapshot remains available after completion. Restoring a safety snapshot also creates another safety backup first. The protocol avoids large unsafe batches and the rules' per-operation access budget; a twelve-bottle restoration and interrupted cycles are emulator tested.

Snapshots are arrangements, **not full database backups**. They do not recover deleted records or restore old prices, descriptions or photographs. No automatic retention/deletion policy is enabled. Do not use a layout snapshot as a substitute for an existing full data backup.

### Spark resource implications

Each ordinary occupancy transaction adds one coordination write and one compact journal write; the first change in a five-minute bucket adds one layout base. Manual snapshots add one document. A restore adds a safety snapshot and job, then bounded atomic step writes. Layouts contain identifiers/locations, not image data. Snapshot lists paginate 20 at a time, and automatic deltas are read on demand. Preset defaults use shared listeners, without polling or per-bottle fan-out writes.

Firestore's normal document-size and usage quotas still apply; exceptionally large BOTTOM inventories/plans may reach those limits and must not be forced through by disabling validation. No paid storage, Cloud Functions, external AI service or billing upgrade is enabled. See the official [transaction/rules limits](https://firebase.google.com/docs/firestore/manage-data/transactions) and [Firestore quotas](https://firebase.google.com/docs/firestore/quotas).

## Local development and verification

Use Node 22.18+ or 24 and Java 21+ for the emulator suite. From this repository:

```powershell
npm ci
npm test
npm run test:rules
npm run build
npm run dev
```

If Java is not installed on PATH, this workspace already has a local runtime. For this shell only:

```powershell
$env:PATH=(Resolve-Path '..\..\work\firebase-runtime\java21\jdk-21.0.12.1+1-jre\bin').Path+';'+$env:PATH
```

Copy `.env.example` to `.env` only when setting up another checkout. Retain the existing public `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_ADMIN_EMAIL` and `VITE_FIREBASE_ADMIN_UID` configuration. Do not commit `.env`, passwords, private keys or service-account credentials. The password-only administrator login and Firebase session behavior are unchanged.

The emulator script uses **demo-private-cellar** and requires loopback Auth/Firestore emulator hosts; fixture accounts are synthetic. It does not authenticate to the live project. It clears only its local emulator database. Production tests use the normal SDK transaction code and the actual rules file with a test UID in the emulator-only copy.

Development-only UI: `/tests/ui.html?fixtures=1&device=phone#/cellar`. Synthetic inventory is visibly labeled, writes are disabled, and Cellar History cannot access the database through the fixture. Add `&screensaver=1` to exercise inactivity behavior. These HTML fixtures are excluded from the production Vite build. Do not mistake a deliberate fixture save rejection for a live database test.

## Verification results

- Domain/layout/timer suite: 20 passing tests, including currency precision, size labels, legacy capacities, preset ordering, restore planning/conflicts/cycle staging, all 180 camera targets, mobile viewport geometry and screensaver cleanup.
- Emulator suite: **34 passing checks**, including the exhaustive 32-case save matrix. Includes authentication, unauthorized access, legacy records, atomic add/edit/move/remove, three-bottle saves, over-180 BOTTOM inventory, simultaneous occupancy, swaps/stale clients, shared defaults/photos, immutable snapshots, durable grouping, safety backups, interruption/resumption, twelve-bottle restoration and invalid field rejection.
- Browser fixture checks: 844x390 mobile landscape, 390x844 portrait, shortened 844x230 keyboard-sized viewport; hamburger navigation, producer-first fields, exact size dropdown, visible validation, save hitbox, failed-save retention, rotation draft retention, photo compression/preview/confirmation and both swap selection methods. These are simulated viewports, not physical-device certification.
- TypeScript and production build passed. Final checks are reported with delivery.
- Not live tested: production rules, hosted login/save, real-device synchronization, physical camera and native mobile keyboard behavior. No production data was read for QA or changed.

## Files changed

Created: `src/layout.ts`, `src/cellar-history.ts`, `src/CellarHistory.tsx`, `src/SwapPicker.tsx`, `src/RotationGate.tsx`, `src/master-upgrade.css`, `tests/master.test.mjs`, `tests/master-firebase.test.mjs`.

Modified: `src/BottleManager.tsx`, `src/BottlePhoto.tsx`, `src/PhotoEditor.tsx`, `src/domain.ts`, `src/firestore.ts`, `src/store.tsx`, `src/Home.tsx`, `src/MobileShell.tsx`, `src/Screensaver.tsx`, `src/main.tsx`, `src/pages.tsx`, `src/mobile.css`, `src/upgrades.css`, `firestore.rules`, `firestore.indexes.json`, `package.json`, `package-lock.json`, `.gitignore`, `tests/firebase.test.mjs`, `tests/save-regression.test.mjs`, `tests/upgrades.test.mjs`, `tests/ui.tsx`, this README.

Removed: `src/LabelScanner.tsx`, `src/label.ts`, `scripts/prepare-ocr.mjs`, `public/THIRD_PARTY_OCR.txt`, OCR-only label fixtures and generated ignored `public/ocr` assets. Removed dependencies: `tesseract.js`, `@tesseract.js-data/eng`. No new dependencies. Logo, cellar image and Firebase credential files were not changed.

## Deployment preparation — manual only

Both **Firestore rules/index settings and the website** need deployment. No data migration, new Firebase project, Storage setup or billing change is needed. Review the local diff, preserve your existing source/data backup, close other editing sessions and finish any restoration first. These commands are instructions, not actions executed by this task:

```powershell
npm test
npm run test:rules
npm run build
git diff --check
git status --short
```

After approving the reviewed changes, deploy the prepared validation/index settings to the existing project:

```powershell
npx firebase-tools deploy --only firestore:rules,firestore:indexes --project cellar-784b2
```

Then commit/push the reviewed local changes from the `main` branch of this existing repository to trigger its existing official GitHub Pages workflow:

```powershell
git add -- .
git commit -m "Upgrade mobile cellar, shared presets, swaps and layout history"
git push origin main
```

No force push. If the changes are already committed/pushed through your normal review workflow, do not create duplicate commits; use GitHub Actions' existing **Deploy wine cellar to GitHub Pages** workflow instead. Wait for successful Pages deployment, refresh all devices, then verify hosted login, one confirmed save, photo synchronization and layout history before rearranging further. Keep the existing pre-upgrade data and source backup. Do not delete new metadata/coordination collections when investigating an issue.

Vite retains its relative base and HashRouter, so assets/navigation work under `/cellar/`. Existing GitHub repository variables supply public Firebase settings in the workflow; no secret credentials are bundled. No custom domain or DNS changes were made.
