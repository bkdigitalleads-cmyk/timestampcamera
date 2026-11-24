// Unit checks for build 3: the shutter rules behind the build 2 crash fix and the haptic on every
// press, the age and drift rule for reusing a location fix, the location watchdog, and the order
// the photo screen swipes through.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const S = await import('../src/camera/shutter.ts');
const P = await import('../src/stamp/place.ts');
const J = await import('../src/jobs.ts');
const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

// ---------- the crash: never call the camera unless its session is running ----------

test('shutter: the camera is called only when it is allowed, on screen and ready', () => {
  assert.equal(S.canCapture({ permission: true, active: true, ready: true }), true);
  // Back from the punch list: on screen again, but the fresh camera view has not said ready yet.
  assert.equal(S.canCapture({ permission: true, active: true, ready: false }), false);
  // Covered by another screen: its session is stopped.
  assert.equal(S.canCapture({ permission: true, active: false, ready: true }), false);
  assert.equal(S.canCapture({ permission: false, active: true, ready: true }), false);
  assert.ok(S.READY_WAIT_MS >= 1000 && S.READY_WAIT_MS <= 5000);
});

test('shutter (source): the camera view is mounted only while on screen, ready drops when covered, and a press waits for ready', () => {
  const cam = read('src/screens/Camera.tsx');
  assert.match(cam, /\{active \? \(\s*<CameraView/, 'CameraView renders only while active, so a fresh view fires onCameraReady after its session runs');
  assert.match(cam, /if \(!active\) \{\s*readyRef\.current = false;\s*setReady\(false\);/);
  assert.match(cam, /if \(!\(await waitReady\(\)\)\)/, 'a press waits for a ready camera instead of calling a stopped one');
  assert.match(cam, /canCapture\(\{ permission: perm\?\.granted === true, active: activeRef\.current, ready: readyRef\.current \}\)/);
  // Captures run one at a time (expo-camera rejects a second while one is in flight).
  assert.match(cam, /captures\.current = captures\.current\.then\(/);
});

test('shutter: a photo for a punch list item is never a Before, even if the Before switch was left on', () => {
  assert.equal(S.photoRole('item', true, true), null);
  assert.equal(S.photoRole('after', false, true), 'after');
  assert.equal(S.photoRole('photo', true, true), 'before');
  assert.equal(S.photoRole('photo', true, false), null, 'no Before without Pro');
  assert.equal(S.photoRole('photo', false, true), null);
});

// ---------- the haptic on every press ----------

test('haptic: fired first in every press, before any wait; stamping waits until the shutter is quiet', () => {
  const cam = read('src/screens/Camera.tsx');
  const shoot = cam.slice(cam.indexOf('const shoot = () => {'), cam.indexOf('const newJob'));
  assert.ok(shoot.length > 0);
  const firstLine = shoot.split('\n')[1].trim();
  assert.equal(firstLine, 'Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});', 'the haptic is the first thing a press does');
  assert.doesNotMatch(shoot.slice(0, shoot.indexOf('Haptics.impactAsync')), /return|await/);
  assert.match(cam, /<Press onPress=\{shoot\} disabled=\{!permGranted\}/, 'the shutter takes presses while the camera starts; they wait for it');
  // A burst: no stamping while captures are in flight or within the idle time of the last press.
  assert.equal(S.burnMayStart({ now: 10_000, lastPressAt: 9_500, capturing: 0 }), false);
  assert.equal(S.burnMayStart({ now: 10_000, lastPressAt: 5_000, capturing: 1 }), false);
  assert.equal(S.burnMayStart({ now: 10_000, lastPressAt: 10_000 - S.SHUTTER_IDLE_MS, capturing: 0 }), true);
});

// ---------- reusing a location fix honestly ----------

const at = 1_000_000;
const fix = (o = {}) => ({ lat: 41.8818, lng: -87.6232, altitude: null, accuracy: 8, speed: 0, at, ...o });

test('location: a fix is reused only while it still says where the phone is', () => {
  // Standing still: up to 30 seconds.
  assert.ok(P.usableFix(fix(), at + 29_000));
  assert.equal(P.usableFix(fix(), at + 31_000), null);
  // Walking at 1.5 m/s: 30 seconds is 45 m, inside the 50 m drift.
  assert.ok(P.usableFix(fix({ speed: 1.5 }), at + 30_000));
  // On a train at 30 m/s: under 2 seconds.
  assert.ok(P.usableFix(fix({ speed: 30 }), at + 1_500));
  assert.equal(P.usableFix(fix({ speed: 30 }), at + 2_000), null, '60 m away by now');
  // No speed from the phone: 10 seconds at most.
  assert.ok(P.usableFix(fix({ speed: null }), at + 9_000));
  assert.equal(P.usableFix(fix({ speed: null }), at + 11_000), null);
  assert.equal(P.usableFix(fix({ speed: -1 }), at + 11_000), null, 'a negative speed means none');
  // A reading stamped a little in the future (clock skew) counts as age 0.
  assert.ok(P.usableFix(fix({ speed: 30 }), at - 500));
  assert.equal(P.usableFix(null, at), null);
  // The limits themselves.
  assert.equal(P.FIX_MAX_AGE_MS, 30_000);
  assert.equal(P.FIX_NO_SPEED_MAX_AGE_MS, 10_000);
  assert.equal(P.FIX_MAX_DRIFT_M, 50);
});

test('location: a quiet watch is restarted (iOS can pause updates on its own); the shutter reads the place at the press', () => {
  assert.equal(P.watchIsQuiet(null, at), true);
  assert.equal(P.watchIsQuiet(at - 5_000, at), false);
  assert.equal(P.watchIsQuiet(at - P.WATCH_QUIET_MS - 1, at), true);
  const hook = read('src/camera/useLocation.ts');
  assert.match(hook, /distanceInterval: 0/, 'readings keep coming while standing still');
  assert.match(hook, /watchIsQuiet\(lastUpdate\.current, Date\.now\(\)\)\) setRestarts/);
  assert.doesNotMatch(hook, /freshFix|2 \* 60000/, 'the old 2 minute rule is gone');
  assert.match(read('src/screens/Camera.tsx'), /const place = loc\.placeAt\(takenAt\);/);
});

// ---------- swiping between photos ----------

test('swipe: the photo screen goes through a job photos in the grid order', () => {
  const D = 86_400_000;
  const t0 = new Date(2026, 10, 22, 9, 0).getTime();
  const ph = (id, takenAt) => ({ id, takenAt, createdAt: takenAt });
  const order = J.photoOrder([ph('a', t0 - D), ph('b', t0 + 60_000), ph('c', t0), ph('d', t0 - D + 5)]);
  assert.deepEqual(order, ['c', 'b', 'a', 'd'], 'today first, in the order taken, then yesterday');
  assert.deepEqual(J.photoOrder([]), []);
  const job = read('src/screens/Job.tsx');
  assert.match(job, /onPhoto=\{\(pid\) => onPhoto\(pid, photoOrder\(photos\)\)\}/);
  assert.match(read('src/screens/PhotoView.tsx'), /pagingEnabled/);
});

// ---------- build 4 ----------

test('Before is for the next photo only: the switch falls back to Photo once it is used', () => {
  assert.equal(S.beforeAfterPress(true, 'before'), false);
  assert.equal(S.beforeAfterPress(true, null), true, 'a punch list photo (no Before there) leaves the switch as it was');
  assert.equal(S.beforeAfterPress(false, null), false);
  assert.equal(S.beforeAfterPress(false, 'after'), false);
  const cam = read('src/screens/Camera.tsx');
  assert.match(cam, /const role = photoRole\(m\.kind, beforeRef\.current, featureAllowed\(pro, 'pairs'\)\);\s*\/\/ [^\n]*\n\s*beforeRef\.current = beforeAfterPress\(beforeRef\.current, role\);\s*setNextBefore\(beforeRef\.current\);/, 'read and reset at the press, so two quick presses cannot both be Befores');
  // Nothing else turns it on: only the Before chip sets it to true.
  const sets = [...cam.matchAll(/setNextBefore\(([^)]*)\)/g)].map((x) => x[1]);
  assert.deepEqual(sets.sort(), ['!nextBefore', 'beforeRef.current', 'false'].sort());
});

test('Jobs sheet: the job the camera is on has an Open row right under it, straight to the job; All jobs stays', () => {
  const cam = read('src/screens/Camera.tsx');
  const sheet = cam.slice(cam.indexOf('visible={picker}'), cam.indexOf('<NewJobSheet'));
  assert.match(sheet, /\{j\.id === job\?\.id \? \(\s*<Line\s+theme=\{theme\}\s+glyph="jobs"\s+label=\{`Open \$\{jobLabel\(j\)\}`\}\s+sub="Photos, before and after, punch list, report"/);
  assert.match(sheet, /setPicker\(false\);\s*onOpenJob\(j\.id\);/);
  assert.match(sheet, /label="All jobs" sub="Photos by day, before and after, punch lists, reports"/);
});

test('Punch list tab: the photo step shows before any item exists; each row has a labelled Photo button; the keyboard closes after an add', () => {
  const job = read('src/screens/Job.tsx');
  assert.match(job, /Add what is left to do\. Each item gets a Photo button for a picture of the finished work\./);
  const tab = job.slice(job.indexOf('function PunchTab'), job.indexOf('function ItemSheet'));
  assert.match(tab, /<Press onPress=\{\(\) => onShoot\(it\)\}[^>]*accessibilityLabel=\{`Photo for \$\{it\.title\}`\}>\s*<Glyph name="camera"[^>]*\/>\s*<Text[^>]*>\s*Photo\s*<\/Text>/);
  assert.match(job, /photoBtn: \{[^}]*minHeight: 44/);
  assert.match(tab, /setTitle\(''\);\s*\/\/[^\n]*\n\s*Keyboard\.dismiss\(\);\s*onAdded\(\);/);
  assert.match(job, /onAdded=\{\(\) => setTimeout\(\(\) => scroll\.current\?\.scrollToEnd\(\{ animated: true \}\), 250\)\}/);
});
