# Bottle selection and inventory navigation

Mobile rack selection reveals the first occupied depth at the selected row and column. Explicit depth controls still select Front, Middle, or Back. An occupied selection mounts its preview, scrolls it into view inside the rack panel, focuses it without a second scroll, and highlights it for 2.8 seconds. The sticky close header remains visible. Reduced-motion preferences use immediate scrolling. BOTTOM opens its existing list; a single bottle is selected automatically, while multiple bottles require choosing the individual bottle.

View in My Cellar appears in the rack preview and full bottle details on mobile and desktop. It uses `/cellar?bottle=<encoded document ID>` with the existing HashRouter. The exact mobile card or individual desktop bottle row is revealed and highlighted, including bottles sharing identical wine information. Opening Details uses the existing bottle dialog.

Target navigation temporarily bypasses inventory filters. Restore previous filters returns to the earlier query, filters, and sort. These browsing preferences remain in memory during navigation and are scoped by owner and section; they do not survive a full reload. The target ID does survive reloads through the URL. Missing or inactive bottles show a recovery message. Back to selected rack restores that bottle's current rack/depth or BOTTOM selection.

Adjacent rapid rack taps resolve to the latest selection. Double-tap zoom requires two taps on the same target. Scrolling timers and pending animation frames are cleaned up when the selection changes or the component unmounts.

## Files changed

- `src/Home.tsx`: mobile occupied-depth selection, mounted preview reveal, BOTTOM selection, ID-based rack return, inventory button.
- `src/CellarViewer.tsx`: distinguish same-target double-tap zoom from different rack selections.
- `src/BottleManager.tsx`: inventory button in existing full bottle details.
- `src/pages.tsx`: exact inventory entry targeting, temporary filter bypass/restoration, return link, missing-target handling.
- `src/bottle-navigation.ts` (new): ID routing, occupied-depth lookup, scoped browsing preferences, scroll behavior.
- `src/useSelectionReveal.ts` (new): post-mount scrolling, focus, temporary highlight, cleanup and portrait deferral.
- `src/bottle-navigation.css` (new): gold feedback, header clearance, responsive selection controls.
- `src/main.tsx`: load selection styles.
- `tests/ui.tsx`: load selection styles and optional 84-bottle synthetic fixture.
- `tests/bottle-navigation.test.mjs` (new): ID routing, exact occupied depth, preference isolation/restoration and reduced motion regression checks.
- `package.json`: include navigation regression tests in `npm test`; no dependency changes.
- `BOTTLE-NAVIGATION.md` (new): implementation, verification and deployment notes.

No Firebase collections, rules, credentials, transactions or inventory records were changed.

## Verification

- `npm test`: 24 tests passed.
- `npm run build`: TypeScript and Vite production build passed.
- `npm run test:rules`: all 34 Firebase Authentication/Firestore emulator tests passed, using the existing local Java runtime and isolated `demo-private-cellar` project.
- Browser checks used the isolated, clearly labeled synthetic fixture, with database writes disabled. Front R1-C1-D1, Middle R7-C3-D2, Back R12-C5-D3 and BOTTOM selected correctly. Rapid selections, double-tap zoom, initially hidden details, inventory targeting, restoring restrictive search/vintage filters, an 84-bottle list of identical wines, opening existing details, returning to the rack, refresh and missing IDs were checked.
- Landscape viewports 844x390 and 740x360 showed the full preview below the sticky header without horizontal overflow. Desktop 1440x900 retained explicit depth selection and targeted one individual bottle row. Portrait 390x844 displayed the rotation gate. The reduced-motion preview used immediate scrolling; temporary highlights cleared.
- These are browser viewport checks, not tests on physical iPhones or Android phones. Live Firebase data was not modified or used for the UI checks.

## Local testing and deployment

Run `npm run dev` and open the printed local URL. For isolated UI testing, use `/tests/ui.html?fixtures=1&device=phone#/`, adding `&long=1` for 84 bottles or `&reduce=1` for the mobile preview's reduced-motion override. Test fixtures are excluded from the production build.

Run `npm test`, `npm run build`, and the existing `npm run test:rules` emulator suite. If Java is missing from PATH, use the local Java runtime command documented in README.md before running the emulator suite.

This is a frontend-only release: no Firestore rules deployment or database migration is required. After approval, commit the listed source/test/documentation changes and push to main. The existing `.github/workflows/pages.yml` builds and deploys the website to GitHub Pages with the existing Firebase repository variables. Pushing to main starts deployment. No push or deployment has been performed.
