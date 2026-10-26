# Producer-first inventory, 3D replay and iPad landscape

## What changed

My Cellar now emphasizes Producer in a bold primary heading, followed by Wine Name. Missing producers fall back to the wine name; neither stored value changes. Vintage, bottle size, type, individual location and price remain available. Tablet/phone cards also offer Show in Cellar directly. Desktop retains its grouped wine cards and exact individual bottle controls.

Show in Cellar retains the original photograph and calibrated rack map. The zoom lasts 1,950ms instead of 1,500ms (30% slower), with eased tracking. After the photograph phase (3.3 seconds), a procedural Three.js scene shows the selected bay. It contains only active bottles from the selected row and column, matched by stable ID. Duplicate/ambiguous occupants are rejected rather than guessed.

Front needs no removals. For Middle or Back, only actual occupied positions in front are pulled out and staged, in Front-to-Back order. Each visual removal takes 1.25 seconds, followed by a 1.7-second camera pan. Empty positions remain empty. Gold rings identify the selected bottle, with Front/Middle/Back labels in the scene and an accessible inventory depth guide. Wine information emphasizes Producer. These components have no Firestore write, movement, snapshot or history API.

Replay restarts from the full photograph. Skip immediately shows the final geometry and depth. Close cancels the sequence and returns to the originating page; inventory/search returns target the same bottle ID. Return to Full Cellar restores the normal rack with that bottle selected. Reduced motion goes straight to the final view. BOTTOM retains its whole-area photograph highlight, selected bottle information and explicit shared-area explanation, without invented depth coordinates or individual physical placements.

The tablet breakpoint covers landscape widths 1,000–1,366 CSS pixels, including 1180x820 and 1024x768. A compact hamburger leaves content width available. Tablet inventory uses two columns, bottle forms use two columns, and history/statistics/settings have compact layouts. Forms use the existing VisualViewport height/offset integration, an independently scrolling field area and a visible Save/Cancel footer. Rotation hides the mounted interface without resetting drafts. The device-aware rotation gate remains inactive for ordinary desktop windows.

## Geometry assumptions and performance

This is a simplified open-sided cutaway, not a measured reconstruction. Rack dimensions, bottle proportions, materials, lights and staging shelf are illustrative. Bottles use one generic horizontal shape, including uncommon sizes; actual sizes and wine metadata remain in the existing details. Photographs are not stretched onto meshes. Original rack hitboxes and all 180 address IDs are unchanged. Pinch zoom and the 44px location picker remain available for precise touch selection.

Three.js 0.186.1 is the only new runtime dependency; @types/three 0.186.0 is development-only. There is no React Three Fiber, external model, image service, server, paid API or Firebase configuration change. Three.js is loaded only for rack replays, not normal browsing or BOTTOM. Its built chunk is approximately 135kB gzip. Vite's advisory about a minified chunk exceeding 500kB is expected; the production build succeeds.

The renderer caps pixel ratio at 1.5 and the canvas at 1.6 million pixels, reduces resolution after slow frames, uses 512px shadows, pauses on hidden tabs/portrait gating and stops its animation loop at completion. Resize redraws without restarting inventory state. Unmount cancels frames and disposes geometry, materials, generated label textures, shadow resources, renderer and observers/listeners. WebGL creation failure or context loss leaves the correct HTML depth guide and controls available. Retry creates a fresh canvas; natural context restoration redraws a final view.

## Verification

- Unit tests: 30 passed, including every valid selected-depth/occupancy combination, removal order, empty/inactive/ambiguous positions, read-only planning, perspective bounds throughout the camera pan, producer fallbacks and origin/ID navigation.
- Firebase emulator tests: 34 passed against `demo-private-cellar`, including authentication restrictions, add/edit/move/remove, reservations, price/photo persistence, presets, swaps and snapshot restoration safety. No live Firebase data was used or changed.
- TypeScript and Vite production build: passed. `git diff --check`: passed.
- Browser checks: producer-first cards; initial photo replay; genuine WebGL geometry; Front, Middle with a Front blocker, Back with two blockers and Back without blockers; BOTTOM; Replay/Skip/Close; early cancellation; reduced motion; correct rack selection; exact-ID inventory targeting with 84 identical-wine bottles; returning to the originating page; tablet Add form, preset population, exact six size options, swap picker and confirmation controls; statistics, activity timeline and settings.
- Simulated sizes: 1180x820, 1024x768, 1194x744, toolbar-sized 1180x740, keyboard-sized 1180x430, phone 844x390, desktop 1440x900, device portrait 820x1180 and ordinary desktop portrait 900x1100. Checked overflow, controls, two-column layout, rotation gate and retained unsaved draft. The keyboard-sized form retained a visible 44px Save button.
- The unavailable-WebGL fallback was observed during development. Sustained performance and actual hardware context-loss recovery were not certified on a physical iPad.

Not performed: physical iPad/Safari, installed PWA, native keyboard/safe-area or camera-permission tests; hosted administrator login; production saves or snapshot restores. The UI fixture intentionally denies snapshot database access, so live snapshot preview/restore interaction was not exercised in the browser; restoration logic/security passed the emulator suite. Verify these on the actual device after an approved deployment. Browser viewport simulation does not establish an iPad frame-rate guarantee.

Development-only synthetic fixtures: `/tests/ui.html?fixtures=1&device=ipad&bay=7#/cellar`. `bay` is an occupancy bit mask: 1=Front, 2=Middle, 4=Back (7=all three). Fixtures use R5-C3, preserve `test-front`, `test-middle`, `test-back` IDs and disable writes. `long=1` enables 84 bottles; `reduce=1` skips replay motion. Test HTML is excluded from the production build.

## Files

Created:

- `src/RackScene3D.tsx` — procedural geometry, rendering, animation and GPU lifecycle.
- `src/rack-scene.ts` — read-only occupancy plan, animation timeline, camera fitting and heading fallback.
- `src/cinema.css` — producer hierarchy and replay controls/overlays.
- `src/tablet.css` — dedicated tablet workspace and shortened-viewport forms.
- `tests/cinema.test.mjs` — geometry, occupancy, sequence and heading regressions.
- `IPAD-3D-UPGRADE.md` — implementation, limitations, verification and deployment.

Modified:

- `src/CellarReplay.tsx` — photograph-to-3D sequence, controls, fallback depth information.
- `src/Home.tsx` — pass confirmed inventory and preserve replay navigation/selection.
- `src/BottleManager.tsx` — remember the originating page for Show in Cellar.
- `src/bottle-navigation.ts`, `tests/bottle-navigation.test.mjs` — exact-bottle origin return.
- `src/pages.tsx` — producer-first cards, readable bottle size/price, direct replay links.
- `src/mobile.ts`, `src/mobile.css`, `src/master-upgrade.css`, `src/bottle-navigation.css`, `src/branding.css` — extend shared compact-shell rules to tablets.
- `src/RotationGate.tsx` — device-neutral rotation wording.
- `src/main.tsx`, `tests/ui.tsx` — load styles and extend isolated test fixtures.
- `package.json`, `package-lock.json` — Three.js/types and test registration.

Unchanged: Firebase credentials/configuration, rules/indexes, store/transaction code, production records, presets, photos, snapshots, cellar artwork and rack coordinates.

## Local checks and deployment

Use `npm.cmd`/`npx.cmd` in Windows PowerShell so the disabled script execution policy does not block npm. From this repository:

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run build
npm.cmd run dev
```

For the emulator suite, use the existing workspace Java runtime for this shell only:

```powershell
$env:PATH=(Resolve-Path '..\..\work\firebase-runtime\java21\jdk-21.0.12.1+1-jre\bin').Path+';'+$env:PATH
npm.cmd run test:rules
```

Only the website needs deployment. No Firebase rules deployment, migration, billing upgrade, DNS change or new environment variable is required. Nothing was committed, pushed or deployed automatically.

After approving the changes, from this repository on `main`:

```powershell
git status --short
$upgradeFiles=@(
 'package.json','package-lock.json','IPAD-3D-UPGRADE.md',
 'src/BottleManager.tsx','src/CellarReplay.tsx','src/Home.tsx',
 'src/RotationGate.tsx','src/bottle-navigation.ts','src/bottle-navigation.css',
 'src/branding.css','src/main.tsx','src/master-upgrade.css','src/mobile.css',
 'src/mobile.ts','src/pages.tsx','src/RackScene3D.tsx','src/rack-scene.ts',
 'src/cinema.css','src/tablet.css','tests/cinema.test.mjs',
 'tests/bottle-navigation.test.mjs','tests/ui.tsx'
)
git add -- $upgradeFiles
git diff --cached --stat
git commit -m "Add producer-first inventory, 3D rack replay and iPad layouts"
git push origin main
```

Pushing to `main` starts the existing GitHub Pages workflow. Retain the existing Firebase repository variables and `/cellar/` hosting setup. The unchanged relative Vite asset base and HashRouter also apply to the dynamically imported renderer. After deployment, refresh devices and check the real iPad in landscape, portrait, reduced-motion and keyboard-open conditions.
