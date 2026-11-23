// Unit checks for the photo report: the copy size of each photo, page
// counts as photos grow, what goes in (days, pairs, punch list, sign-off),
// every drawing inside the page, and a real 30-photo PDF made the way the
// app makes it (Skia downscales each 12 MP photo, pdf-lib writes the pages)
// that stays under 10 MB.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { PDFDocument } from 'pdf-lib';

const RL = await import('../src/report/layout.ts');
const RP = await import('../src/report/plan.ts');
const FO = await import('../src/pdf/fonts.ts');
const PDF = await import('../src/pdf/pdf.ts');
const B = await import('../src/stamp/burn.ts');
const PU = await import('../src/punch.ts');
const { SAMPLE } = await import('./sample-signature.mjs');

const root = new URL('..', import.meta.url);
const read = (p) => new Uint8Array(readFileSync(new URL(p, root)));
const fonts = Object.fromEntries(Object.entries(FO.FONT_FILES).map(([k, f]) => [k, read(`assets/fonts/${f}`)]));
const measure = FO.makeMeasure(fonts);

const T0 = new Date(2026, 10, 18, 9, 12).getTime();
const DAY = 86400000;
const job = { id: 'j', name: 'Miller kitchen', address: '1420 Elm St, Springfield, IL 62704', client: 'Dana Miller', notes: 'Subfloor, tile and trim. Client wants the grout color matched.', createdAt: T0, updatedAt: T0 };
const photo = (id, takenAt, o = {}) => ({ id, jobId: 'j', takenAt, file: '', original: '', thumb: '', width: 4032, height: 3024, lat: 41.88, lng: -87.62, altitude: null, address: '1420 Elm St', note: '', caption: '', imported: false, role: null, pairId: null, itemId: null, stamp: null, createdAt: takenAt, ...o });
const photos = (n) => Array.from({ length: n }, (_, i) => photo(`p${i}`, T0 + Math.floor(i / 10) * DAY + i * 60000, { caption: i % 3 === 0 ? 'Subfloor screwed down every 6 inches along the joists' : '' }));
const ALL = { photos: true, pairs: true, punch: true, signature: true, days: null };
const input = (o = {}) => ({ company: 'Reyes Home Repair', logo: { width: 256, height: 256 }, job, photos: photos(6), items: [], signoff: null, options: ALL, paper: 'letter', clock: '12', now: T0 + 4 * DAY, ...o });

function checkInside(rep, W, H) {
  for (const [i, p] of rep.pages.entries()) {
    assert.equal(p.width, W);
    assert.equal(p.height, H);
    for (const op of p.ops) {
      if (op.k === 'text') {
        assert.ok(op.x >= 0 && op.x + measure.width(op.text, op.font, op.size) <= W + 0.5 && op.y > 0 && op.y < H, `text inside page ${i + 1}: ${op.text}`);
      } else if (op.k === 'image' || op.k === 'rect') {
        assert.ok(op.x >= 0 && op.y >= 0 && op.x + op.w <= W + 0.5 && op.y + op.h <= H - 34, `${op.k} ${op.id ?? ''} inside page ${i + 1}`);
      }
    }
  }
}

test('report copies: about 200 ppi of the box, never more than 1400 px or the photo itself', () => {
  assert.deepEqual(RP.reportPixels(259, 194, 4032, 3024), { width: 720, height: 540 });
  assert.deepEqual(RP.reportPixels(600, 450, 4032, 3024), { width: 1400, height: 1050 });
  assert.deepEqual(RP.reportPixels(259, 194, 640, 480), { width: 640, height: 480 }, 'never upscaled');
  assert.deepEqual(RP.reportPixels(80, 60, 4032, 3024), { width: 480, height: 360 }, 'a floor for tiny boxes');
  assert.deepEqual(RP.reportPixels(194, 259, 3024, 4032), { width: 540, height: 720 }, 'portrait keeps its shape');
  const thirty = Array.from({ length: 30 }, () => RP.reportPixels(259, 194, 4032, 3024));
  assert.ok(RP.estimateReportBytes(thirty) < RP.REPORT_BUDGET_BYTES / 2, 'a cautious estimate is well under 10 MB');
});

test('report pages: the cover and grid, more pages as photos grow, page numbers on every page', () => {
  const counts = [0, 1, 2, 6, 12, 30, 60].map((n) => RL.layoutReport(measure, input({ photos: photos(n) })).pages.length);
  for (let i = 1; i < counts.length; i++) assert.ok(counts[i] >= counts[i - 1], `pages never shrink as photos grow: ${counts}`);
  assert.equal(counts[0], 1);
  assert.equal(counts[1], 1, 'one photo fits on the cover page');
  assert.ok(counts[5] >= 6 && counts[5] <= 9, `30 photos: ${counts[5]} pages`);
  const rep = RL.layoutReport(measure, input({ photos: photos(30) }));
  assert.equal(rep.photoCount, 30);
  assert.equal(rep.images.length, 30);
  rep.pages.forEach((p, i) => assert.ok(p.ops.some((o) => o.k === 'text' && o.text === `Page ${i + 1} of ${rep.pages.length}`)));
  checkInside(rep, 612, 792);
  const a4 = RL.layoutReport(measure, input({ photos: photos(30), paper: 'a4' }));
  checkInside(a4, 595.28, 841.89);
});

test('report cover: company, title, job, client, dates and counts; no company or logo is fine', () => {
  const rep = RL.layoutReport(measure, input());
  const texts = rep.pages[0].ops.filter((o) => o.k === 'text').map((o) => o.text);
  for (const t of ['REYES HOME REPAIR', 'Photo report', 'Miller kitchen', 'Dana Miller', '1420 Elm St, Springfield, IL 62704', 'Nov 18, 2026', '6 photos', 'Nov 22, 2026']) assert.ok(texts.includes(t), `cover has ${t}`);
  assert.ok(rep.pages[0].ops.some((o) => o.k === 'image' && o.id === 'logo'));
  const bare = RL.layoutReport(measure, input({ company: '', logo: null, job: { ...job, client: '', address: '', notes: '' } }));
  assert.ok(!bare.pages[0].ops.some((o) => o.k === 'image' && o.id === 'logo'));
  checkInside(bare, 612, 792);
});

test('report content: chosen days only; pairs side by side and out of the grid; an imported photo says so', () => {
  const ps = [photo('b1', T0, { role: 'before', caption: 'Water damage under sink' }), photo('a1', T0 + 2 * DAY, { role: 'after', pairId: 'b1' }), photo('n1', T0 + 60000), photo('i1', T0 + DAY, { imported: true }), photo('b2', T0 + 120000, { role: 'before' })];
  const rep = RL.layoutReport(measure, input({ photos: ps }));
  assert.equal(rep.pairCount, 1);
  assert.equal(rep.photoCount, 5);
  const texts = rep.pages.flatMap((p) => p.ops.filter((o) => o.k === 'text').map((o) => o.text));
  assert.ok(texts.includes('Before and after'));
  assert.ok(texts.includes('BEFORE') && texts.includes('AFTER'));
  assert.ok(texts.some((t) => t.startsWith('Imported')));
  const content = RL.reportContent(ps, ALL);
  assert.deepEqual(content.grid.map((p) => p.id).sort(), ['b2', 'i1', 'n1'], 'a Before without its After stays in the grid');
  const oneDay = RL.reportContent(ps, { ...ALL, days: ['2026-11-18'] });
  assert.deepEqual(oneDay.grid.map((p) => p.id).sort(), ['b1', 'b2', 'n1'], 'the pair is split across days, so it is not a pair in a one-day report');
  assert.equal(oneDay.pairs.length, 0);
  const noPairs = RL.reportContent(ps, { ...ALL, pairs: false });
  assert.equal(noPairs.grid.length, 5);
  const noPhotos = RL.reportContent(ps, { ...ALL, photos: false });
  assert.equal(noPhotos.grid.length, 0);
  assert.equal(noPhotos.pairs.length, 1);
});

test('report punch list: every item with its status, done date and photo count; long titles wrap inside the page', () => {
  let items = [];
  for (const [i, t] of ['Fix door latch', 'Caulk the tub where it meets the tile on the long wall, both corners, clear silicone', 'Touch up paint in the hall'].entries()) items.push(PU.addItem(items, { id: `i${i}`, jobId: 'j', title: t, note: i === 1 ? 'Clear, not white' : '', now: T0 + i }));
  items[0] = PU.toggleItem(items[0], new Date(2026, 10, 21, 15, 0).getTime());
  const ps = [photo('p1', T0, { itemId: 'i1' }), photo('p2', T0 + 1, { itemId: 'i1' })];
  const rep = RL.layoutReport(measure, input({ photos: ps, items }));
  const texts = rep.pages.flatMap((p) => p.ops.filter((o) => o.k === 'text').map((o) => o.text));
  assert.ok(texts.includes('Punch list'));
  assert.ok(texts.includes('1 of 3 done'));
  assert.ok(texts.includes('Done Nov 21'));
  assert.equal(texts.filter((t) => t === 'Open').length, 2);
  assert.ok(texts.includes('2 photos'));
  assert.ok(texts.includes('Clear, not white'));
  checkInside(rep, 612, 792);
  const off = RL.layoutReport(measure, input({ photos: ps, items, options: { ...ALL, punch: false } }));
  assert.ok(!off.pages.flatMap((p) => p.ops).some((o) => o.k === 'text' && o.text === 'Punch list'));
});

test('report sign-off: the client signature as vector paths with the name and date, only when signed and chosen', () => {
  const signoff = { strokes: SAMPLE, name: 'Dana Miller', at: T0 + 4 * DAY };
  const rep = RL.layoutReport(measure, input({ signoff }));
  const ops = rep.pages.flatMap((p) => p.ops);
  assert.ok(ops.some((o) => o.k === 'path'));
  assert.ok(ops.some((o) => o.k === 'text' && o.text === 'Dana Miller, client'));
  assert.ok(ops.some((o) => o.k === 'text' && o.text.startsWith('Signed Nov 22, 2026')));
  checkInside(rep, 612, 792);
  const off = RL.layoutReport(measure, input({ signoff, options: { ...ALL, signature: false } }));
  assert.ok(!off.pages.flatMap((p) => p.ops).some((o) => o.k === 'path'));
});

test('report PDF: 30 photos from 12 MP, downscaled by Skia and written by pdf-lib, under 10 MB, every page read back', async () => {
  const require = createRequire(import.meta.url);
  const CK = await require('canvaskit-wasm/bin/full/canvaskit.js')();
  const { JsiSkApi } = require('@shopify/react-native-skia/lib/commonjs/skia/web/JsiSkia.js');
  const Skia = JsiSkApi(CK);
  const big = read('tests/fixtures/site-4032x3024.jpg');
  const ps = photos(30);
  const rep = RL.layoutReport(measure, input({ photos: ps, logo: { width: 256, height: 256 } }));
  // One downscale per distinct size is enough here: every photo is the same 12 MP file.
  const images = { logo: read('tests/fixtures/logo-256.png') };
  const cache = new Map();
  for (const im of rep.images) {
    const px = RP.reportPixels(im.w, im.h, 4032, 3024);
    const key = `${px.width}x${px.height}`;
    if (!cache.has(key)) cache.set(key, B.downscaleJpeg(Skia, big, Math.max(px.width, px.height), RP.REPORT_QUALITY));
    const out = cache.get(key);
    assert.equal(Math.max(out.width, out.height), Math.max(px.width, px.height));
    images[im.id] = out.bytes;
  }
  const bytes = await PDF.writePdf(rep.pages, fonts, images, { title: 'Photo report, Miller kitchen', author: 'Reyes Home Repair', subject: 'Miller kitchen' });
  console.log(`  30-photo report: ${rep.pages.length} pages, ${(bytes.length / 1024 / 1024).toFixed(2)} MB`);
  assert.ok(bytes.length < RP.REPORT_BUDGET_BYTES, `${bytes.length} bytes`);
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), rep.pages.length);
  assert.equal(doc.getTitle(), 'Photo report, Miller kitchen');
});
