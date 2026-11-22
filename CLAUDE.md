@AGENTS.md

# Timestamp Camera (timestampcamera)

App #19 in Brian's iOS app portfolio (seller bkdigitalleads-cmyk). Expo SDK 57, React Native 0.86, TypeScript, expo-camera (the camera), expo-location (when in use only, and the device's own geocoder), @shopify/react-native-skia (burns the stamp into the photo offscreen at full size, draws the live stamp, the report preview and the signature pad), expo-sqlite (jobs, photo records, punch lists, settings), pdf-lib with @pdf-lib/fontkit (the photo report), expo-media-library (add-only copies to Photos, only when turned on), react-native-maps (Apple Maps snapshot for the optional map thumbnail, Pro), RevenueCat, expo-notifications (local only, one trial reminder). Engine forked from Estimate Maker (estimatemaker main at 4bdf558, Nov 19, 2026), which came from Signature Maker, Migraine Log, Image to Text, Pumping and Odo 1.0.6. The estimate, invoice, client and item modules were dropped. There are no local native modules.

- App Store name: "Timestamp Camera: Job Photos" (accepted in App Store Connect). Subtitle "GPS Map Camera, Time Stamp". Home screen name "Timestamp Cam" (`ios.infoPlist.CFBundleDisplayName`); in-app name "Timestamp Camera". Category Photo & Video, secondary Business. Bundle ID com.bwk.timestampcamera. Expo slug and scheme: timestampcamera. Owner bkdeveloper123. GitHub: bkdigitalleads-cmyk/timestampcamera.
- Set up (Nov 22, 2026, values from Brian): app.json `extra.revenueCatApiKeyIos` is the public RevenueCat SDK key (starts with `appl_`, so purchases are on; the app runs with purchases off whenever it does not), eas.json `ascAppId` 6838074080. Still a placeholder: app.json `extra.eas.projectId` (`COWORK_PLACEHOLDER_EXPO_PROJECT_ID`), until Brian sends it.
- Not in the store yet. 1.0.0 build 1 is on branch claude/camera-1.0.0 (PR, not merged).
- What it is: the stamp camera for people who photograph work. Every photo belongs to a job; the date, time, address and coordinates are burned into the photo; before and after pair up; a punch list lives in the job; the day ends with a PDF photo report. No account and no server of ours; we collect nothing beyond the purchase record. Photos and reports stay on the phone until the person shares them. Two things do go to Apple: the coordinates, for the address lookup (only while the stamp's Address line is on), and the area shown, for the optional map picture. Never write that nothing leaves the phone or that locations stay on it.
- Guardrails, always: the stamp reports the phone's clock and location, nothing more. Never call it tamper-proof, legal proof or verified, anywhere. No brand names in the app, the listing, the samples or the website. Sample data uses plain made-up names.

## How shipping works (read before every push)

- A push to `main` that touches app.json, eas.json, package*.json, App.tsx, index.ts, src/, assets/ or modules/ starts an EAS workflow (.eas/workflows/deploy.yml) once the Expo project is connected. It builds iOS in the cloud and uploads the build to App Store Connect / TestFlight. Every such push costs a paid build credit.
- Never merge to `main` without Brian. Work on a branch and open a PR.
- Pushes that only change Markdown files (CLAUDE.md, NOTES.md, README.md, store/metadata.md), store/ or docs/ do not build.
- Version numbers are local (`appVersionSource: local`, no auto-increment). Before any push that builds: raise `ios.buildNumber` in app.json by 1, and raise `version` when it will become a new App Store release.
- Before every commit: run `npx tsc --noEmit` and `npm test`, and fix every error.
- Batch the changes for one app into one push. Ask Brian before any push that builds, and say what is in it.
- Submitting for App Review, release dates, prices, the subtitle, keywords, the age rating and screenshots all happen in App Store Connect. Brian and his Cowork session handle that side.

## Rules

- Brian handles every credential and sign-in. Never type, paste, print or store passwords, tokens or API keys (the RevenueCat `appl_` key is a public SDK key and lives in app.json). If git push asks for credentials, stop and tell Brian.
- No spending (paid services, EAS builds beyond what Brian approved) without Brian saying go.
- Never change the RevenueCat entitlement id `pro`, the offering `default`, the product ids (camera_pro_weekly, camera_pro_yearly, camera_pro_lifetime), the packages ($rc_weekly, $rc_annual, $rc_lifetime) or the logic in src/purchases.ts (a copy of the engine's) without Brian asking. Paying users must never lose Pro. Prices and trial text on screen always come from StoreKit through RevenueCat.
- Free forever (src/gates.ts holds the rules, with checks): the camera, every stamp line and template, one job, saving to Photos, fixing a stamp, and the first photo report. Free photos carry no extra watermark. Pro: more jobs, company name and logo on the stamp, the map, before and after pairs, punch lists, reports after the first, importing photos. Never lock anyone out of what they made: photos can always go into any job that exists, everything stays readable and shareable, and a job whose report went out free can send it again.
- The shutter never waits: what the live stamp shows at that moment prints. Never block the shutter on an address or a map. No signal: coordinates in the address's place, nothing else said. Location denied: date and time only.
- The stamp is burned into the saved photo at full resolution by src/stamp/burn.ts (the same layout and drawing as the live stamp). The original is always kept, so a stamp can be corrected.
- Location is "when in use" only, never background. The three usage strings (camera, location when in use, add to Photos) say exactly why; no other usage string may appear. After touching plugins, check `npx expo config --type introspect` shows only those three and `ios.entitlements` as `{}`. plugins/withoutPushEntitlement.js stays last in app.json plugins.
- The database only ever gains migrations (src/db/schema.ts `MIGRATIONS`). Never edit or reorder a shipped migration; add a new one. Photo file paths are stored relative to the documents folder.
- Do not change the app name, subtitle, keywords or the rating-prompt triggers (a report shared; a later-day launch after ten photos; at most one per launch; never while the camera is open) without asking.
- Keep changes small. List anything else you notice in NOTES.md under "Noticed, not changed" instead of fixing it. No broad refactors, dependency upgrades or Expo SDK upgrades unless Brian asks.
- Copy voice: plain, short, written like a tradesperson would say it. No "Unlock", "Premium", "Seamless", "Effortless", "Welcome", "Let's", exclamation marks or em dashes in any user-facing text (app, notification, report, store text, website), in commits or in PRs. Support email bkdigitalleads@gmail.com only. `npm test` scans for these.
- Design (docs/design/NOTES.md) uses the theme's tokens and the Site kit (src/ui/Site.tsx). Glyphs are drawn in src/ui/Glyph.tsx. No icon pack. Fonts: only SIL OFL fonts, each with its licence in assets/fonts.
- We never receive anything: never add analytics, a server, sync or a network call of ours. The only outside calls are Apple's: the address lookup (the coordinates go to Apple's location service; made only while the Address line is on, src/stamp/place.ts `needsGeocode`) and the optional map picture (Apple Maps). Both are stated plainly in docs/privacy.html; the privacy label stays Purchases only. `npm test` checks the wording.

## Logging (so Brian's Cowork session can follow along)

- With every commit, add an entry at the top of NOTES.md in the same commit: date, version/build, what changed and why, and how it was checked.

## Testing

- Type check: `npx tsc --noEmit`. Unit checks: `npm test` (includes the stamp proof: a 12 MP JPEG stamped at full size through Skia's own JS API over CanvasKit). Bundle check: `npx expo export --platform ios`. Config: `npx expo config --type introspect`.
- Pure logic has no React or native imports (it imports with a `.ts` extension so Node runs it directly), so `npm test` checks exactly what the app runs. burn.ts takes the Skia API as a parameter for the same reason.
- Simulator (needs Xcode): Expo Go does not work (Skia, RevenueCat and maps need a development build). The simulator has no camera; purchases do not complete there.
- Real-device check: TestFlight build from the EAS workflow, on Brian's iPhone. NOTES.md has the TestFlight checklist.
