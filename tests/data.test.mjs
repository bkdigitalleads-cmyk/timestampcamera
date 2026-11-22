// Unit checks for the data layer and the rules around it: the migrations
// and every read and write on a real SQLite (Node's built-in node:sqlite
// runs the same SQL as expo-sqlite); photos by day, date ranges and before
// and after pairs; punch list state; free versus Pro; the rating rules; the
// engine's plan and trial rules; settings parsing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

const SC = await import('../src/db/schema.ts');
const R = await import('../src/db/repo.ts');
const MO = await import('../src/model.ts');
const J = await import('../src/jobs.ts');
const PU = await import('../src/punch.ts');
const G = await import('../src/gates.ts');
const RU = await import('../src/rules.ts');
const O = await import('../src/offer.ts');
const ST = await import('../src/settings.ts');

function nodeDb() {
  const sq = new DatabaseSync(':memory:');
  const norm = (p) => p.map((v) => (v === undefined ? null : v));
  return {
    exec: async (sql) => sq.exec(sql),
    run: async (sql, p = []) => {
      sq.prepare(sql).run(...norm(p));
    },
    all: async (sql, p = []) => sq.prepare(sql).all(...norm(p)).map((r) => ({ ...r })),
    get: async (sql, p = []) => {
      const r = sq.prepare(sql).get(...norm(p));
      return r ? { ...r } : null;
    },
    tx: async (fn) => {
      sq.exec('BEGIN');
      try {
        await fn();
        sq.exec('COMMIT');
      } catch (e) {
        sq.exec('ROLLBACK');
        throw e;
      }
    },
  };
}

const T0 = new Date(2026, 10, 18, 9, 12).getTime();
const DAY = 86400000;
const job = (id, name, at = T0) => ({ id, name, address: '1420 Elm St', client: 'Dana Miller', notes: '', createdAt: at, updatedAt: at });
const photo = (id, jobId, takenAt, o = {}) => ({
  id,
  jobId,
  takenAt,
  file: `photos/${jobId}/${id}.jpg`,
  original: `photos/${jobId}/${id}-original.jpg`,
  thumb: `photos/${jobId}/${id}-small.jpg`,
  width: 4032,
  height: 3024,
  lat: 41.88,
  lng: -87.62,
  altitude: null,
  address: '1420 Elm St',
  note: '',
  caption: '',
  imported: false,
  role: null,
  pairId: null,
  itemId: null,
  stamp: { template: 'standard', corner: 'bottomLeft', size: 'medium', lines: ['Nov 18, 2026  9:12 AM'], logo: false, map: false },
  createdAt: takenAt,
  ...o,
});

// ---------- database ----------

test('migrations: run once, end at the last version, refuse a newer database', async () => {
  const db = nodeDb();
  assert.equal(await SC.migrate(db), SC.MIGRATIONS.length);
  assert.equal(await SC.migrate(db), SC.MIGRATIONS.length);
  await db.exec(`PRAGMA user_version = ${SC.MIGRATIONS.length + 1}`);
  await assert.rejects(SC.migrate(db), /newer version/);
});

test('jobs and photos: save, list with counts and the newest thumb, newest job first', async () => {
  const db = nodeDb();
  await SC.migrate(db);
  await R.saveJob(db, job('a', '  Miller kitchen '));
  await R.saveJob(db, job('b', 'Ortiz deck', T0 + 10));
  await R.savePhoto(db, photo('p1', 'a', T0));
  await R.savePhoto(db, photo('p2', 'a', T0 + 2 * DAY, { note: 'After tile' }));
  const list = await R.listJobs(db);
  assert.deepEqual(list.map((j) => j.id), ['a', 'b'], 'the job with the newest photo first');
  assert.equal(list[0].name, 'Miller kitchen', 'trimmed');
  assert.equal(list[0].photoCount, 2);
  assert.equal(list[0].lastThumb, 'photos/a/p2-small.jpg');
  assert.equal(list[1].photoCount, 0);
  assert.equal(await R.countJobs(db), 2);
  assert.equal(await R.countPhotos(db), 2);
  const p2 = await R.getPhoto(db, 'p2');
  assert.equal(p2.note, 'After tile');
  assert.deepEqual(p2.stamp.lines, ['Nov 18, 2026  9:12 AM']);
  assert.equal(p2.imported, false);
  await R.savePhoto(db, { ...p2, caption: 'Grout done', imported: true });
  assert.equal((await R.getPhoto(db, 'p2')).caption, 'Grout done');
  assert.equal((await R.getPhoto(db, 'p2')).imported, true);
  assert.deepEqual((await R.listPhotos(db, 'a')).map((p) => p.id), ['p1', 'p2']);
});

test('before and after: marking, pairing, unmarking a Before unpairs its After, deleting a Before frees its After', async () => {
  const db = nodeDb();
  await SC.migrate(db);
  await R.saveJob(db, job('a', 'Miller kitchen'));
  await R.savePhoto(db, photo('b1', 'a', T0));
  await R.savePhoto(db, photo('a1', 'a', T0 + DAY));
  await R.setRole(db, 'b1', 'before');
  await R.setRole(db, 'a1', 'after', 'b1');
  let pairs = J.pairsOf(await R.listPhotos(db, 'a'));
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].after.id, 'a1');
  await R.setRole(db, 'b1', null);
  assert.equal((await R.getPhoto(db, 'a1')).role, null);
  assert.equal((await R.getPhoto(db, 'a1')).pairId, null);
  await R.setRole(db, 'b1', 'before');
  await R.setRole(db, 'a1', 'after', 'b1');
  const files = await R.deletePhoto(db, 'b1');
  assert.deepEqual(files, ['photos/a/b1.jpg', 'photos/a/b1-original.jpg', 'photos/a/b1-small.jpg']);
  assert.equal((await R.getPhoto(db, 'a1')).role, null);
  pairs = J.pairsOf(await R.listPhotos(db, 'a'));
  assert.equal(pairs.length, 0);
});

test('deleting a job removes its photos and punch list and returns every file; other jobs are untouched', async () => {
  const db = nodeDb();
  await SC.migrate(db);
  await R.saveJob(db, job('a', 'A'));
  await R.saveJob(db, job('b', 'B'));
  await R.savePhoto(db, photo('p1', 'a', T0));
  await R.savePhoto(db, photo('p2', 'b', T0));
  await R.saveItem(db, PU.addItem([], { id: 'i1', jobId: 'a', title: 'Fix latch', now: T0 }));
  const files = await R.deleteJob(db, 'a');
  assert.equal(files.length, 3);
  assert.equal(await R.getJob(db, 'a'), null);
  assert.deepEqual(await R.listItems(db, 'a'), []);
  assert.equal(await R.countPhotos(db), 1);
});

test('punch list in the database: items in order, a deleted item leaves its photos in the job', async () => {
  const db = nodeDb();
  await SC.migrate(db);
  await R.saveJob(db, job('a', 'A'));
  const i1 = PU.addItem([], { id: 'i1', jobId: 'a', title: 'Fix latch', now: T0 });
  const i2 = PU.addItem([i1], { id: 'i2', jobId: 'a', title: 'Caulk tub', note: 'Clear, not white', now: T0 + 1 });
  await R.saveItem(db, i1);
  await R.saveItem(db, i2);
  await R.savePhoto(db, photo('p1', 'a', T0, { itemId: 'i2' }));
  await R.saveItem(db, PU.toggleItem(i2, T0 + 5));
  const items = await R.listItems(db, 'a');
  assert.deepEqual(items.map((i) => [i.title, i.status]), [['Fix latch', 'open'], ['Caulk tub', 'done']]);
  assert.equal(items[1].doneAt, T0 + 5);
  assert.equal((await R.listJobs(db))[0].openItems, 1);
  await R.deleteItem(db, 'i2');
  assert.equal((await R.getPhoto(db, 'p1')).itemId, null);
  assert.equal((await R.getPhoto(db, 'p1')).jobId, 'a');
});

test('key/value: set, overwrite, delete', async () => {
  const db = nodeDb();
  await SC.migrate(db);
  await R.kvSet(db, 'k', '1');
  await R.kvSet(db, 'k', '2');
  assert.equal(await R.kvGet(db, 'k'), '2');
  await R.kvDelete(db, 'k');
  assert.equal(await R.kvGet(db, 'k'), null);
});

// ---------- days, ranges, pairs ----------

test('photos by day: newest day first, in the order taken inside a day; day labels', () => {
  const ps = [photo('x', 'a', T0 + DAY + 60000), photo('y', 'a', T0), photo('z', 'a', T0 + DAY)];
  const days = J.photosByDay(ps);
  assert.deepEqual(days.map((d) => d.key), ['2026-11-19', '2026-11-18']);
  assert.deepEqual(days[0].photos.map((p) => p.id), ['z', 'x']);
  const now = new Date(2026, 10, 19, 20, 0).getTime();
  assert.equal(J.dayLabel('2026-11-19', now), 'Today');
  assert.equal(J.dayLabel('2026-11-18', now), 'Yesterday');
  assert.equal(J.dayLabel('2026-11-12', now), 'Thursday, Nov 12');
  assert.equal(J.dayLabel('2025-12-31', now), 'Wednesday, Dec 31, 2025');
  assert.equal(J.longDay(T0), 'Wednesday, Nov 18, 2026');
});

test('date range: one day, same month, across months, across years, none', () => {
  const at = (y, m, d) => ({ takenAt: new Date(y, m - 1, d, 10).getTime() });
  assert.equal(J.dateRange([at(2026, 11, 22)]), 'Nov 22, 2026');
  assert.equal(J.dateRange([at(2026, 11, 22), at(2026, 11, 18)]), 'Nov 18 to 22, 2026');
  assert.equal(J.dateRange([at(2026, 11, 28), at(2026, 12, 3)]), 'Nov 28 to Dec 3, 2026');
  assert.equal(J.dateRange([at(2026, 12, 30), at(2027, 1, 2)]), 'Dec 30, 2026 to Jan 2, 2027');
  assert.equal(J.dateRange([]), null);
});

test('pairs: each Before with its newest After; a Before without one is listed alone', () => {
  const ps = [photo('b1', 'a', T0, { role: 'before' }), photo('b2', 'a', T0 + 5, { role: 'before' }), photo('a1', 'a', T0 + DAY, { role: 'after', pairId: 'b1' }), photo('a1b', 'a', T0 + 2 * DAY, { role: 'after', pairId: 'b1' }), photo('n', 'a', T0 + 9)];
  const pairs = J.pairsOf(ps);
  assert.deepEqual(pairs.map((p) => [p.before.id, p.after?.id ?? null]), [['b1', 'a1b'], ['b2', null]]);
});

test('job names: Job 1, Job 2, the first free number; counts read plainly', () => {
  assert.equal(J.nextJobName([]), 'Job 1');
  assert.equal(J.nextJobName([{ name: 'Job 1' }, { name: 'job 2' }, { name: 'Miller' }]), 'Job 3');
  assert.equal(J.photoCount(0), 'No photos yet');
  assert.equal(J.photoCount(1), '1 photo');
  assert.equal(J.photoCount(12), '12 photos');
  assert.equal(MO.jobLabel({ name: '  ' }), 'Untitled job');
  assert.match(MO.newId(T0, () => 0.5), /^[0-9a-z]{14,}$/);
});

// ---------- punch list state ----------

test('punch list: add at the end, refuse empty, tick off and reopen, move, count', () => {
  const a = PU.addItem([], { id: 'a', jobId: 'j', title: '  Fix   door latch ', now: 1 });
  assert.equal(a.title, 'Fix door latch');
  assert.equal(a.status, 'open');
  assert.equal(a.position, 0);
  assert.equal(PU.addItem([a], { id: 'x', jobId: 'j', title: '   ', now: 2 }), null);
  const b = PU.addItem([a], { id: 'b', jobId: 'j', title: 'Touch up paint', now: 2 });
  const c = PU.addItem([a, b], { id: 'c', jobId: 'j', title: 'Clean gutters', now: 3 });
  assert.equal(c.position, 2);
  const bDone = PU.toggleItem(b, 10);
  assert.equal(bDone.status, 'done');
  assert.equal(bDone.doneAt, 10);
  const bOpen = PU.toggleItem(bDone, 11);
  assert.equal(bOpen.status, 'open');
  assert.equal(bOpen.doneAt, null);
  let items = [a, bDone, c];
  assert.deepEqual(PU.punchCounts(items), { total: 3, open: 2, done: 1 });
  assert.equal(PU.punchSummary(items), '1 of 3 done');
  assert.equal(PU.punchSummary([]), 'Nothing on the list yet');
  assert.equal(PU.punchSummary([PU.toggleItem(a, 1), bDone]), 'All 2 done');
  const moved = PU.moveItem(items, 'c', -1, 20);
  items = items.map((i) => moved.find((m) => m.id === i.id) ?? i);
  assert.deepEqual(PU.ordered(items).map((i) => i.id), ['a', 'c', 'b']);
  assert.deepEqual(PU.moveItem(items, 'a', -1, 21), [], 'the first cannot move up');
});

// ---------- free versus Pro ----------

test('gates: one job free, more need Pro; shooting into an existing job is never gated', () => {
  assert.equal(G.canAddJob(false, 0), true);
  assert.equal(G.canAddJob(false, 1), false);
  assert.equal(G.canAddJob(true, 40), true);
  assert.equal(G.canShoot(false), true);
});

test('gates: the first report is free; a second job’s report needs Pro; the free job can send again', () => {
  assert.deepEqual(G.reportDecision(false, [], 'a'), { allowed: true, usesFree: true });
  const used = G.recordFreeReport([], 'a');
  assert.deepEqual(G.recordFreeReport(used, 'a'), ['a'], 'counted once');
  assert.deepEqual(G.reportDecision(false, used, 'a'), { allowed: true, usesFree: false });
  assert.deepEqual(G.reportDecision(false, used, 'b'), { allowed: false, usesFree: false });
  assert.deepEqual(G.reportDecision(true, used, 'b'), { allowed: true, usesFree: false });
  assert.deepEqual(G.parseFreeReports('["a","a",3,""]'), ['a']);
  assert.deepEqual(G.parseFreeReports('{bad'), []);
});

test('gates: company, logo, map, pairs, punch lists and imports are Pro; every paywall reason has words', () => {
  for (const f of ['company', 'logo', 'map', 'pairs', 'punch', 'import']) {
    assert.equal(G.featureAllowed(false, f), false);
    assert.equal(G.featureAllowed(true, f), true);
    assert.ok(G.PAYWALL_COPY[f].title && G.PAYWALL_COPY[f].line);
  }
  for (const r of ['job', 'report', 'pro']) assert.ok(G.PAYWALL_COPY[r].title.endsWith('.'));
});

// ---------- rating prompt ----------

test('rating: never while the camera is open, once per launch, each trigger once; the launch trigger needs ten photos and a later day', () => {
  assert.equal(RU.reviewAllowed({ cameraOpen: false, askedThisLaunch: false, triggerUsed: false }), true);
  assert.equal(RU.reviewAllowed({ cameraOpen: true, askedThisLaunch: false, triggerUsed: false }), false);
  assert.equal(RU.reviewAllowed({ cameraOpen: false, askedThisLaunch: true, triggerUsed: false }), false);
  assert.equal(RU.reviewAllowed({ cameraOpen: false, askedThisLaunch: false, triggerUsed: true }), false);
  assert.equal(RU.shouldAsk({ cameraOpen: false, askedThisLaunch: false, triggerUsed: false, storeCanAsk: false }), false);
  assert.equal(RU.launchReviewDue({ photoCount: 10, firstDay: '2026-11-20', today: '2026-11-22' }), true);
  assert.equal(RU.launchReviewDue({ photoCount: 9, firstDay: '2026-11-20', today: '2026-11-22' }), false);
  assert.equal(RU.launchReviewDue({ photoCount: 40, firstDay: '2026-11-22', today: '2026-11-22' }), false, 'not on the first day');
  assert.equal(RU.afterOnboardingPaywall(true), 'app');
  assert.equal(RU.afterOnboardingPaywall(false), 'claim');
});

// ---------- engine plan rules (unchanged copy) ----------

test('plans: weekly first and preselected; trial wording only when eligible; yearly saving; disclosure', () => {
  assert.deepEqual(O.planOrder(true), ['WEEKLY', 'ANNUAL', 'LIFETIME']);
  assert.equal(O.preselect(['ANNUAL', 'WEEKLY', 'LIFETIME'], false), 'WEEKLY');
  assert.equal(O.trialLabelFrom({ price: 0, periodNumberOfUnits: 3, periodUnit: 'DAY' }, true), '3 days free');
  assert.equal(O.trialLabelFrom({ price: 0, periodNumberOfUnits: 3, periodUnit: 'DAY' }, false), null);
  assert.equal(O.yearlySavingPct(4.99, 39.99), 84);
  const d = O.disclosureText({ weekly: '$4.99', yearly: '$39.99', lifetime: '$59.99', trial: '3 days free' });
  assert.match(d, /Weekly \$4\.99\/week .* starts with 3 days free/);
  assert.match(d, /Lifetime \$59\.99 is a one-time purchase/);
});

// ---------- settings ----------

test('settings: logo parsing, paper by region, readable file names', () => {
  assert.deepEqual(ST.parseLogo('{"file":"logo.png","width":200,"height":80}'), { file: 'logo.png', width: 200, height: 80 });
  assert.equal(ST.parseLogo('{"file":"","width":1,"height":1}'), null);
  assert.equal(ST.parseLogo('nope'), null);
  assert.equal(ST.paperFor('US'), 'letter');
  assert.equal(ST.paperFor('GB'), 'a4');
  assert.equal(ST.paperFor(null), 'a4');
  assert.equal(ST.fileName(['Photo report', 'Miller: kitchen/bath', '2026-11-22'], 'pdf'), 'Photo report Miller kitchen bath 2026-11-22.pdf');
  assert.equal(ST.fileName(['', ' '], 'jpg'), 'Photo.jpg');
});
