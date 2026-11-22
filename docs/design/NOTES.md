# Timestamp Camera design notes (1.0.0, Nov 22, 2026)

## Concept: the site board

The person opening this app is standing in a half-finished kitchen or on a roof, phone in one hand, maybe gloves on, sun on the screen. They take 5 to 50 photos a job and need each one to say when and where without thinking about it. So the app opens on the camera and gets out of the way.

- The camera is dark chrome, #0F1113, matte. The picture is the brightest thing on the screen and nothing glares in sun. The preview is the photo's own 3:4 frame, so the live stamp drawn over it is exactly where it prints.
- The shutter is 92 points: a white disc in a hi-vis yellow ring, big enough for a gloved thumb, centred where the thumb rests. Left of it the last photo (opens the job); right of it Stamp.
- The job chip at the top ("Job: Miller kitchen") is the one thing to check before shooting. Tap it to switch or add a job.
- Everything outside the camera is light and plain: pale concrete (#F3F4F1), white cards with a 1 px edge and 10 pt corners, near-black ink (#15181B). No cards inside cards, no gradients.
- One accent, hi-vis yellow (#FFC61A), like a safety vest or a level's vial. It is only ever a fill with ink lettering (ink on yellow is 12.6:1; yellow text on white would not read), with a darker lip (#C99700) so the button holds its edge on white. It means the main action: the shutter ring, Build report, Share report, Continue. Picked chips are solid ink, switches are ink, Done is green.
- Type is Barlow (SIL OFL), a grotesque drawn from highway and site signage: Barlow Condensed SemiBold for titles, field labels in capitals and the main button; Barlow SemiBold for the stamp itself. Body text is the system font.
- The stamp: white Barlow SemiBold with a thin dark edge round every letter and a soft shadow, so it reads on a white wall, a blue sky and a dark floor alike (checked on the sample photos in `after/` and in `stamp-proof.jpg`). Sizes follow the photo's short side (2.6, 3.4 and 4.5 percent), so the stamp covers the same share of a 12 MP photo and of the preview. Text runs toward its corner's edge; the logo and map sit on the outside.
- Motion is quiet: sheets fade, feedback is by touch (a firm tap on the shutter, a tick on chips, a success tap when a stamp is fixed or an item is ticked off).

## The component kit (src/ui/Site.tsx)

Its own names, not Estimate Maker's: Press, GoButton (the yellow main action), PlainButton, IconButton (light, or `dark` on the camera chrome), Chip (picked is solid ink; a lock for Pro), Card and Line, SwitchLine, Heading, Hint, FieldLabel, Input and InputLine, Header, Tag (Open, Done, Before, After, Imported), Sheet and Toast. The theme (src/theme.ts) holds every color, radius, space and type size.

## Renders (`after/`)

393x852 points at 2x, from a throwaway web copy of the app (not in the repo): the real screens, kit, stamp layout and drawing, report layout and Skia (react-native-skia's own web build over CanvasKit), on react-native-web, with the camera showing a sample scene, the data layer replaced by a sample job (Miller kitchen, 12 photos over three days, one before and after pair, four punch list items), a stubbed store at $4.99 weekly with 3 days free, $39.99 yearly and $59.99 lifetime, a drawn status bar and the clock pinned to Nov 22, 2026, 2:05 PM. The sample photos are simple drawn scenes stamped by the app's own burn code. The system font is stood in for by Inter, and switches show react-native-web's look; haptics, the real iOS keyboard, Dynamic Type and VoiceOver are not visible.

01 camera with the live stamp (Pro, logo on); 02 taking an After with the Before shown faintly; 03 camera with location off (date and time only, "Location off" pill); 04 and 05 the stamp editor; 06 a stamped photo; 07 jobs; 08 a job's photos by day; 09 and 10 before and after; 11 the punch list; 12 and 13 the report builder and its page preview; 14 the onboarding paywall; 15 the in-app paywall (opened by a second job); 16 settings; 17 to 19 the three value screens; 20 to 22 the permission screens; 23 the trial screen.

`report/` has the sample report's five pages, drawn from the same operations the PDF writer uses. `stamp-proof.jpg` is the stamp proof's output (a 12 MP photo stamped at full size, shown at 1600 px).

## Icon

Three concepts in `icon-options.png`, each large and at 60 px on a light and a dark wallpaper (`cd store && node icon.js`). None is picked; Brian picks, then `node icon.js ship <name>` writes assets/ and the website icons. Until then assets/icon.png is a plain placeholder (a dark tile with a thin frame), and the TestFlight build should not go out with it.

1. corner: a photo with the stamp block printed in its bottom corner, on chrome. Says exactly what the app does; the stamp block gets small at 60 px.
2. pin: a map pin whose head is a clock face, on hi-vis yellow. The strongest silhouette at 60 px and the most different from the big stamp cameras, but says "where and when" more than "camera".
3. shutter: the app's own yellow shutter ring over three stamp lines, on chrome. Ties the icon to the first screen; reads as "camera" first.

No letters, no brand marks, no hard hat or wrench.

## The report

Laid out once by src/report/layout.ts as drawing operations on Letter or A4 pages (by region); pdf-lib writes them and Skia draws the same list for the preview, with the same Barlow files. A thin yellow band tops each page. The cover block has the company in condensed capitals, "Photo report", the job, then a fact column (address, client, dates, counts, prepared, notes) and the logo top right. Photos go in two columns by day with their stamps already in the pixels and the report's own caption under each (the time, Before or After, the caption or note, and "Imported" for library photos). Portrait photos sit in a square box at most, so two rows fit a page. Pairs go side by side under BEFORE and AFTER tags. The punch list shows a ticked green box or an empty one, the title and note, "Done Nov 22" or "Open", and its photo count. The sign-off is the client's signature as vector paths over a line, with the name and time. Every page ends with the job and "Page 2 of 5". A heading never sits alone at the bottom of a page.

Each photo's copy is made at about 200 ppi of its box (720 x 540 for a 12 MP photo in the grid), JPEG quality 72, so a 30-photo report stays well under 10 MB (src/report/plan.ts, checked by `npm test`).
