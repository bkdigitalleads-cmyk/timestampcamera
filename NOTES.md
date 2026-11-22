# Timestamp Camera change log

Newest first. One entry per commit: date, version/build, what changed and why, and how it was checked.

- 2026-11-22: 1.0.0 build 1, icon options, third round (A refined).
  - docs/design/icon-options-3.png (`cd store && node icon.js options3`): A1, A as it was, for comparison; A2, the stamp block covering the lower third of the photo edge to edge with a bigger clock and pin and two thick lines; A3, A's photo with a bright tag in place of the block holding a dark clock, pin and two lines, in yellow with a smaller safety orange copy beside it. Each large and at 60 px on a light and a dark wallpaper. No digits, no letters, no brand marks. Notes in docs/design/NOTES.md.
  - Nothing picked; assets/icon.png is unchanged (the placeholder). No app code changed.
  - Checked: `npx tsc --noEmit` clean, `npm test` passing (the sheet's file is checked to exist), each variant looked at large and at 60 px.

- 2026-11-22: 1.0.0 build 1, icon options, second round.
  - docs/design/icon-options-2.png (`cd store && node icon.js options2`): four new variants on the dark background, each large and at 60 px on a light and a dark wallpaper. A, a photo whose stamp block holds a clock and a pin beside two lines. B, a camera from the front with a stamp strip under the lens. C, a framed photo with a safety orange tag showing 09:41 in segment digits and a pin. D, a lens ring with a pin inside and a clock badge. No yellow backgrounds, no white tile with a lens, no letters, no brand marks. Notes on each in docs/design/NOTES.md.
  - Nothing picked; assets/icon.png is unchanged (the placeholder). No app code changed.
  - Checked: `npx tsc --noEmit` clean, `npm test` passing (the sheet's file is now checked to exist), each variant looked at large and at 60 px.

- 2026-11-22: 1.0.0 build 1, privacy wording corrected (review fix; the old wording was not accurate).
  - The app runs no server and collects nothing beyond the purchase record, and photos and reports stay on the iPhone until shared. But the address on the stamp is looked up with Apple's location service, so the coordinates go to Apple for that lookup, and the optional map picture loads from Apple Maps. The old wording said nothing leaves the phone and that locations stay on it; that is gone everywhere: store/metadata.md (the listing's privacy heading is now YOUR PHOTOS STAY ON YOUR PHONE with "No account and no server of ours. Photos and reports stay on your iPhone until you share them."; the review note and the privacy-label notes say what goes to Apple; the label stays Purchases only), docs/index.html, docs/privacy.html (a new "What goes to Apple" section saying plainly that both features use Apple's services and Apple receives the coordinates), docs/support.html, the location usage string in app.json, onboarding, the camera's location sheet and no-camera screen, the stamp editor's Address and Map lines, Settings' About, CLAUDE.md, README.md and code comments.
  - Turning the stamp's Address line off now means no lookup at all: `needsGeocode` in src/stamp/place.ts returns false when the address will not print, useLocation takes the Address setting from the camera and the stamp editor, and imports skip the lookup too. Before this, the camera looked up the address whenever location was on, even with the Address line off.
  - Checked: `npx tsc --noEmit` clean, `npm test` 63 passing (new: no lookup with Address off; the listing heading and line, the privacy page's Apple section, the label still Purchases only, and none of the old claims in anything people read), `npx expo export --platform ios` bundles, `npx expo config --type introspect` still shows only the three usage strings and `ios.entitlements: {}`. Renders 05, 20 and 21 re-shot with the new copy.

- 2026-11-22: 1.0.0 build 1, design, website, listing and checks (branch claude/camera-1.0.0).
  - Design "site board" (docs/design/NOTES.md): dark camera chrome, light plain screens, one hi-vis yellow accent on the main action only, Barlow (SIL OFL) for titles, labels and the stamp. Own component kit, src/ui/Site.tsx. 23 renders in docs/design/after (393x852 at 2x) from a throwaway web copy of the real screens; the sample report's pages in docs/design/report.
  - Icon: three concepts in docs/design/icon-options.png (store/icon.js). None picked; assets/icon.png is a plain placeholder until Brian picks (`node icon.js ship <name>`).
  - Website (docs/): landing page, privacy.html (Purchases through RevenueCat only, not linked, not used for tracking; photos and reports stay on the phone until shared; location when in use only; the address lookup and the optional map use Apple's services), support.html with an FAQ, sitemap.xml, robots.txt, og-image.
  - store/metadata.md: names, subtitles and keywords (English and Spanish Mexico), promotional text, description, What's New, review note, screenshot plan, category, age rating, privacy label, purchases.
  - Report layout: day headings and section headings stay with what follows; portrait photos sit in a square box so two rows fit a page; grid photos align with their captions.
  - Checked: `npx tsc --noEmit` clean, `npm test` passing (new: identity, the Cowork values and the one placeholder left, the three usage strings and no background location, the listing's lengths and keyword rules, banned words, exclamation marks and em dashes in everything people read, no tamper-proof or verified claims, no brand names, the website's files and links, the renders' size, ink and accent contrast, the fonts), `npx expo export --platform ios` bundles, `npx expo config --type introspect` shows only the three usage strings and `ios.entitlements: {}`.

- 2026-11-22: 1.0.0 build 1, screens.
  - Camera first, with the live stamp drawn by the same layout and drawing that burns it in; the job chip; a 92 pt shutter; Photo or Before; taking an After with the Before shown at 38 percent; photos for a punch list item; the "Location off" pill and sheet; turning the phone sideways lays the stamp out on the landscape frame.
  - Stamp editor, jobs list, a job (photos by day, before and after, punch list, Build report), the photo screen (share, save to Photos, mark Before, take the After, caption, fix the stamp from the original, delete), the report (what goes in, days, client sign-off, page preview, share and print), settings (company and logo, saving to Photos, Pro and restore, help, the test menu behind seven taps on the version line in test builds), onboarding (three value screens, camera, location and Photos saving, then the engine's trial, reminder and paywall).
  - Checked: `npx tsc --noEmit` clean, `npm test` passing, `npx expo export --platform ios` bundles.

- 2026-11-22: 1.0.0 build 1, engine fork, data layer and pure checks.
  - Started from Estimate Maker main at 4bdf558: Expo SDK 57.0.12, React Native 0.86.3, React 19.2.3, TypeScript 6.0, the EAS workflows (unchanged), eas.json, plugins/withoutPushEntitlement.js (last in plugins), index.ts startup guard, App.tsx render guard and font wait. Engine copies: src/purchases.ts (unchanged), src/trial.ts, src/offer.ts (unchanged), src/testing.ts, src/reminder.ts (new id and wording), src/reviews.ts and src/rules.ts (triggers: a report shared, a later-day launch after ten photos; guard: never while the camera is open), src/state.tsx (with the foreground Pro re-check; free reports instead of free exports), src/stroke.ts and the signature pad, src/pdf (writer now embeds many JPEGs by id), the SQLite plumbing, the paywall and the trial and reminder screens.
  - Dropped: estimates, quotes, invoices, receipts, clients, items, money, numbering, the document templates and their screens, the mail composer, IBM Plex.
  - Added: expo-camera 57.0.6, expo-location 57.0.22, expo-media-library 57.0.5, react-native-maps 1.27.2 (versions from expo's bundledNativeModules.json), Barlow fonts.
  - New pure modules: stamp text, layout, fallbacks, place and EXIF reading (src/stamp), jobs by day and pairs (src/jobs.ts), the punch list (src/punch.ts), free versus Pro (src/gates.ts), the report layout and copy sizes (src/report).
  - Identity: Timestamp Camera, slug timestampcamera, com.bwk.timestampcamera, 1.0.0 build 1, home screen name Timestamp Cam, iPhone only. RevenueCat key and App Store Connect id from Brian; the Expo project id is a marked placeholder.
  - Checked: `npx tsc --noEmit` clean, `npm test` 50 passing.

- 2026-11-22: 1.0.0 build 1, the stamp proof (first commit).
  - src/stamp/burn.ts draws a photo and its stamp on an offscreen Skia surface at the photo's full size and encodes a JPEG. tests/stamp-proof.test.mjs runs it on a bundled 4032x3024 JPEG through react-native-skia's own JS API over CanvasKit (the same Skia, in WebAssembly): the output is 4032x3024 (read from its own JPEG header), the pixels inside the stamp's box changed (mean 40 of 255) and far from it did not (0.08), an EXIF-rotated photo comes out upright, and no EXIF GPS is left in the file. docs/design/stamp-proof.jpg is the result.

## TestFlight checklist (1.0.0 build 1), around a real job

Before the build: Brian picks the icon (`cd store && node icon.js ship <name>`), and the Expo project id goes into app.json.

1. Fresh install. Go through the three screens, allow the camera, deny location the first time, skip Photos saving. Close the paywall after its X appears (3 seconds); the "Free, for good" sheet shows.
2. Make a job from the job chip: "New job" is free the first time. Name it after the real job, fill the client, use the spot's address.
3. Take five photos with location denied: the stamp shows the date and time only, the "Location off" pill shows, the shutter fires at once and "Saved to <job>" appears. Open the job: five photos under Today.
4. Turn location on (the pill's sheet, or Settings). Take more photos: the address appears in the live stamp within a few seconds. Turn on Airplane Mode and take one: the coordinates print instead of the address. Turn the phone sideways and take one: the photo is landscape and the stamp sits in the same corner as the preview showed.
5. Before and after (Pro, or after starting the trial): switch to Before, shoot a spot. Open that photo, Take the After: the Before shows faintly; line up and shoot. Open the job's Before and after tab, open the pair, Share the pair (one side-by-side image).
6. Punch list: add two items, attach a photo to one with its camera button, tick one off.
7. Build report: check the cover, the photos by day with captions, the pair side by side, the punch list with Done and Open, then Client signs here and sign. Share report to Files and open the PDF; check its size and that the stamps are readable. Print to a printer or Save as PDF.
8. Stamp editor: try each template, corner and size, 24 hour with seconds, a note; check the live stamp matches the saved photo. Open a photo, Fix the stamp, change the note; the photo updates and the time and place stay.
9. Settings: add a company name and a logo (PNG with a clear background, and a HEIC photo); with Pro both appear on the stamp. Turn on Save copies to Photos: iOS asks for add-only access; take a photo and find it in Photos.
10. Paywalls: as a free user (Settings, seven taps on the version line, Act as a free user), add a second job (paywall), build a report for a second job (paywall), tap Before (paywall), Import from Photos (paywall). Restore purchases on each, and on a second device with the same Apple ID.
11. Rating prompt: after a report is shared, at most once; never over the camera.
12. Dark mode on the phone: the app stays light outside the camera, as designed. Largest Dynamic Type size and VoiceOver on the camera controls, the job chip and the shutter.

## Noticed, not changed

- The burn runs on the JS thread with native Skia. In WebAssembly it takes about 0.8 s for 12 MP; on a phone it should be quicker, but the UI may pause briefly while a photo is saved. If it shows on device, the next step is moving the burn to a worklet thread.
- The map thumbnail (Pro, off unless turned on) uses react-native-maps' snapshot of Apple Maps, which needs signal and loads map tiles from Apple for that area. It is disclosed beside the switch in the stamp editor, in the privacy policy and here; the photos stay on the phone. Only a device can show how quickly the snapshot comes back.
- An imported photo with no date in its file prints no date or time, and its report caption says "Imported" in place of a time. Its record keeps the import time for sorting by day.
- Fix the stamp does not redraw the map; a photo whose stamp had a map loses it when the stamp is fixed.
- The report's photo copies are made one by one on the JS thread; a 50-photo report takes a few seconds to build on screen ("Building the report").
- The renders' sample photos are drawn scenes, which compress far better than real photos; the 30-photo test report is 0.6 MB, a real one will be larger. The size estimate in src/report/plan.ts assumes busy photos (0.35 bytes a pixel, about 4 MB for 30) and stays under 10 MB.
- Estimate Maker's notification handler and trial reminder are kept; the reminder asks for notification permission on the onboarding reminder screen only when a trial is on offer.
- The app is light only outside the camera (`userInterfaceStyle: light`), as briefed.
