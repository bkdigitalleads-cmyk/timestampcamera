/**
 * The stamp proof. A bundled 12 MP JPEG (4032 x 3024) gets a multi-line
 * stamp (date, time, address, coordinates, note, job, company, a small logo
 * and a map thumbnail) burned in by the app's own src/stamp/burn.ts, through
 * @shopify/react-native-skia's JS API over CanvasKit (Skia in WebAssembly),
 * offscreen, and is encoded back to JPEG. The checks:
 *  - the output is a JPEG of the same pixel size as the input, read from its
 *    own frame header (not from Skia);
 *  - inside the stamp's box the pixels changed (white text and its shadow);
 *  - well away from the stamp the pixels are the same, up to JPEG
 *    re-encoding noise;
 *  - a photo whose EXIF says "rotated" is stamped upright, at its upright size.
 * A downscaled copy of the result is written to docs/design/stamp-proof.jpg.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { burnStamp, composePair, downscaleJpeg } from '../src/stamp/burn.ts';
import { defaultStamp, stampLines } from '../src/stamp/content.ts';
import { readJpeg } from '../src/stamp/exif.ts';

const require = createRequire(import.meta.url);
// The full CanvasKit build: the default web build leaves out the JPEG encoder, which native Skia has.
const CanvasKitInit = require('canvaskit-wasm/bin/full/canvaskit.js');
const { JsiSkApi } = require('@shopify/react-native-skia/lib/commonjs/skia/web/JsiSkia.js');

const root = new URL('..', import.meta.url);
const read = (p) => new Uint8Array(readFileSync(new URL(p, root)));

let Skia;
let typeface;
const ready = (async () => {
  const CK = await CanvasKitInit();
  Skia = JsiSkApi(CK);
  typeface = Skia.Typeface.MakeFreeTypeFaceFromData(Skia.Data.fromBytes(read('assets/fonts/Barlow-SemiBold.ttf')));
})();

/** A stand-in map picture: streets on a pale ground, as a PNG. */
function fakeMap() {
  const s = Skia.Surface.Make(240, 240);
  const c = s.getCanvas();
  c.clear(Skia.Color('#E9E4D8'));
  const road = Skia.Paint();
  road.setColor(Skia.Color('#FFFFFF'));
  road.setStyle(1);
  road.setStrokeWidth(14);
  c.drawLine(0, 90, 240, 120, road);
  c.drawLine(120, 0, 100, 240, road);
  s.flush();
  return s.makeImageSnapshot().encodeToBytes(4);
}

function pixels(bytes) {
  const img = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(bytes));
  return { w: img.width(), h: img.height(), px: img.readPixels() };
}

/** Mean absolute difference per channel over a rectangle. */
function meanDiff(a, b, r) {
  let sum = 0;
  let n = 0;
  const x0 = Math.max(0, Math.floor(r.x));
  const y0 = Math.max(0, Math.floor(r.y));
  const x1 = Math.min(a.w, Math.ceil(r.x + r.w));
  const y1 = Math.min(a.h, Math.ceil(r.y + r.h));
  for (let y = y0; y < y1; y += 2)
    for (let x = x0; x < x1; x += 2) {
      const i = (y * a.w + x) * 4;
      sum += Math.abs(a.px[i] - b.px[i]) + Math.abs(a.px[i + 1] - b.px[i + 1]) + Math.abs(a.px[i + 2] - b.px[i + 2]);
      n += 3;
    }
  return sum / n;
}

const settings = { ...defaultStamp({ dateStyle: 'mdy', clock: '12', units: 'ft' }), template: 'full', corner: 'bottomLeft', size: 'medium', note: 'Kitchen subfloor, east wall' };
settings.show = { ...settings.show, altitude: true, map: true, logo: true, company: true };
const ctx = {
  time: new Date(2026, 10, 22, 14, 5, 9).getTime(),
  place: { lat: 41.881832, lng: -87.623177, altitude: 182.3, address: '1420 Elm St, Springfield, IL 62704' },
  jobName: 'Miller kitchen',
  company: 'Reyes Home Repair',
  pro: true,
  hasLogo: true,
};

test('stamp proof: a 12 MP JPEG is stamped at full size and changes only inside the stamp', async () => {
  await ready;
  const input = read('tests/fixtures/site-4032x3024.jpg');
  const before = readJpeg(input);
  assert.equal(before.width, 4032);
  assert.equal(before.height, 3024);

  const content = stampLines(settings, ctx);
  assert.deepEqual(content.lines, [
    'Nov 22, 2026  2:05 PM',
    '1420 Elm St, Springfield, IL 62704',
    '41.88183° N, 87.62318° W  ·  Alt 598 ft',
    'Miller kitchen',
    'Reyes Home Repair',
    'Kitchen subfloor, east wall',
  ]);
  assert.equal(content.logo, true);
  assert.equal(content.map, true);

  const t0 = Date.now();
  const out = burnStamp(Skia, {
    photo: input,
    content,
    corner: settings.corner,
    size: settings.size,
    singleLine: false,
    typeface,
    logo: read('tests/fixtures/logo-256.png'),
    map: fakeMap(),
  });
  const ms = Date.now() - t0;

  // A real JPEG of the same pixel size, read from its own header.
  assert.equal(out.bytes[0], 0xff);
  assert.equal(out.bytes[1], 0xd8);
  const after = readJpeg(out.bytes);
  assert.equal(after.width, 4032, 'same width as the input');
  assert.equal(after.height, 3024, 'same height as the input');
  assert.equal(out.width, 4032);
  assert.equal(out.height, 3024);
  assert.ok(out.bytes.length > 300_000, `a full-size JPEG, not a thumbnail (${out.bytes.length} bytes)`);

  // Every line, the logo and the map were laid out inside the photo, bottom left.
  const L = out.layout;
  assert.equal(L.lines.length, 6);
  assert.ok(L.logo && L.map);
  assert.ok(L.box.x > 0 && L.box.y > 0 && L.box.x + L.box.w < 4032 && L.box.y + L.box.h < 3024);
  assert.ok(L.box.y > 3024 / 2, 'bottom half');
  assert.ok(L.box.x < 4032 / 4, 'left side');

  const a = pixels(input);
  const b = pixels(out.bytes);
  assert.equal(b.w, a.w);
  assert.equal(b.h, a.h);
  const inside = meanDiff(a, b, L.box);
  const textBand = meanDiff(a, b, { x: L.lines[1].x, y: L.lines[1].y - L.fontSize * 0.8, w: L.lines[1].width, h: L.fontSize });
  const far = meanDiff(a, b, { x: 2400, y: 200, w: 1400, h: 900 });
  console.log(`  burn ${ms} ms in WebAssembly; ${out.bytes.length} bytes; mean change inside the stamp ${inside.toFixed(1)}, on the address line ${textBand.toFixed(1)}, far from it ${far.toFixed(2)} (of 255)`);
  assert.ok(inside > 12, `the stamp area changed (${inside})`);
  assert.ok(textBand > 25, `the text itself changed the pixels (${textBand})`);
  assert.ok(far < 4, `away from the stamp only JPEG noise (${far})`);

  // A copy to look at, 1600 px wide.
  writeFileSync(new URL('docs/design/stamp-proof.jpg', root), downscaleJpeg(Skia, out.bytes, 1600, 85).bytes);
});

test('stamp proof: a photo stored sideways (EXIF orientation 6) is stamped upright at its upright size', async () => {
  await ready;
  const input = read('tests/fixtures/rotated-exif6.jpg');
  const info = readJpeg(input);
  assert.equal(info.orientation, 6);
  assert.equal(info.width, 400);
  assert.equal(info.height, 300);
  const out = burnStamp(Skia, { photo: input, content: { lines: ['Oct 4, 2026  3:42 PM'], logo: false, map: false }, corner: 'bottomRight', size: 'large', singleLine: true, typeface });
  const after = readJpeg(out.bytes);
  assert.equal(after.width, 300);
  assert.equal(after.height, 400);
  assert.equal(after.orientation, 1, 'no orientation tag left to rotate it twice');
  // The stamp is in the bottom right corner of the upright picture.
  assert.ok(out.layout.box.x + out.layout.box.w <= 300 && out.layout.box.x > 300 / 3);
  assert.ok(out.layout.box.y > 400 / 2);
});

test('stamp proof: the stamped file keeps no EXIF GPS; the place is only what the stamp prints', async () => {
  await ready;
  const out = burnStamp(Skia, { photo: read('tests/fixtures/rotated-exif6.jpg'), content: { lines: ['x'], logo: false, map: false }, corner: 'topLeft', size: 'small', singleLine: true, typeface });
  const info = readJpeg(out.bytes);
  assert.equal(info.lat, null);
  assert.equal(info.takenAt, null);
});

test('before and after: a pair becomes one side-by-side image at the asked height', async () => {
  await ready;
  const photo = read('tests/fixtures/site-4032x3024.jpg');
  const small = downscaleJpeg(Skia, photo, 800, 80);
  assert.equal(small.width, 800);
  assert.equal(small.height, 600);
  const pair = composePair(Skia, small.bytes, small.bytes, typeface, 600);
  const info = readJpeg(pair.bytes);
  assert.equal(info.height, 600);
  assert.equal(info.width, 800 + 7 + 800);
});
