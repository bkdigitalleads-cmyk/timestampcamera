// Unit checks for the stamp: time, date, coordinate and address formatting;
// what each template prints and the fallbacks when the address or the
// location is missing; the layout at every template, corner and size; the
// live place rules; EXIF reading and the imported photo's own date and place.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import fontkit from '@pdf-lib/fontkit';

const F = await import('../src/stamp/format.ts');
const C = await import('../src/stamp/content.ts');
const L = await import('../src/stamp/layout.ts');
const P = await import('../src/stamp/place.ts');
const X = await import('../src/stamp/exif.ts');
const I = await import('../src/stamp/importMeta.ts');

// Barlow SemiBold measured with fontkit, the same advances Skia uses.
const font = fontkit.create(readFileSync(new URL('../assets/fonts/Barlow-SemiBold.ttf', import.meta.url)));
const measure = (text, size) => (font.layout(text, { liga: false, kern: false }).glyphs.reduce((a, g) => a + g.advanceWidth, 0) / font.unitsPerEm) * size;

const at = (h, m, s = 0) => ({ year: 2026, month: 11, day: 22, hour: h, minute: m, second: s });

// ---------- time and date ----------

test('time: 12 hour clock, with midnight and noon, with and without seconds', () => {
  assert.equal(F.formatTime(at(14, 5), '12', false), '2:05 PM');
  assert.equal(F.formatTime(at(14, 5, 9), '12', true), '2:05:09 PM');
  assert.equal(F.formatTime(at(0, 0), '12', false), '12:00 AM');
  assert.equal(F.formatTime(at(12, 0), '12', false), '12:00 PM');
  assert.equal(F.formatTime(at(23, 59, 59), '12', true), '11:59:59 PM');
  assert.equal(F.formatTime(at(9, 7, 3), '12', false), '9:07 AM');
});

test('time: 24 hour clock, zero padded, with and without seconds', () => {
  assert.equal(F.formatTime(at(14, 5), '24', false), '14:05');
  assert.equal(F.formatTime(at(14, 5, 9), '24', true), '14:05:09');
  assert.equal(F.formatTime(at(0, 0), '24', false), '00:00');
  assert.equal(F.formatTime(at(9, 7, 3), '24', true), '09:07:03');
});

test('date: month first, day first and year first', () => {
  assert.equal(F.formatDate(at(1, 1), 'mdy'), 'Nov 22, 2026');
  assert.equal(F.formatDate(at(1, 1), 'dmy'), '22 Nov 2026');
  assert.equal(F.formatDate({ ...at(1, 1), month: 3, day: 4 }, 'ymd'), '2026-03-04');
});

test('region habits: US month first, 12 hour and feet; Germany day first, 24 hour and meters; Japan year first', () => {
  assert.deepEqual(F.regionDefaults('US'), { dateStyle: 'mdy', clock: '12', units: 'ft' });
  assert.deepEqual(F.regionDefaults('DE'), { dateStyle: 'dmy', clock: '24', units: 'm' });
  assert.deepEqual(F.regionDefaults('jp'), { dateStyle: 'ymd', clock: '24', units: 'm' });
  assert.deepEqual(F.regionDefaults('AU'), { dateStyle: 'dmy', clock: '12', units: 'm' });
  assert.deepEqual(F.regionDefaults(null), { dateStyle: 'dmy', clock: '24', units: 'm' });
});

// ---------- coordinates ----------

test('coordinates: five decimals with the hemisphere, every quarter of the globe', () => {
  assert.equal(F.formatCoords(41.881832, -87.623177), '41.88183° N, 87.62318° W');
  assert.equal(F.formatCoords(-33.8688, 151.2093), '33.86880° S, 151.20930° E');
  assert.equal(F.formatCoords(51.5, 0), '51.50000° N, 0.00000° E');
  assert.equal(F.formatCoords(-0.000004, -0.000004), '0.00000° S, 0.00000° W');
});

test('coordinates: no fix, nonsense and (0, 0) count as no location', () => {
  assert.equal(F.validCoords(41.8, -87.6), true);
  assert.equal(F.validCoords(null, 2), false);
  assert.equal(F.validCoords(NaN, 2), false);
  assert.equal(F.validCoords(91, 2), false);
  assert.equal(F.validCoords(10, -181), false);
  assert.equal(F.validCoords(0, 0), false);
});

test('altitude: meters or feet, rounded; none when the phone gave none', () => {
  assert.equal(F.formatAltitude(182.3, 'm'), 'Alt 182 m');
  assert.equal(F.formatAltitude(182.3, 'ft'), 'Alt 598 ft');
  assert.equal(F.formatAltitude(-3.6, 'm'), 'Alt -4 m');
  assert.equal(F.formatAltitude(null, 'm'), null);
  assert.equal(F.formatAltitude(NaN, 'ft'), null);
});

test('address: one line from the geocoder parts, missing parts skipped', () => {
  assert.equal(F.formatAddress({ streetNumber: '1420', street: 'Elm St', city: 'Springfield', region: 'IL', postalCode: '62704', country: 'United States' }), '1420 Elm St, Springfield, IL 62704');
  assert.equal(F.formatAddress({ name: 'Riverside Park', city: 'Austin', region: 'TX' }), 'Riverside Park, Austin, TX');
  assert.equal(F.formatAddress({ street: '  Calle   Ocho ', subregion: 'Miami-Dade' }), 'Calle Ocho, Miami-Dade');
  assert.equal(F.formatAddress({ country: 'Iceland' }), 'Iceland');
  assert.equal(F.formatAddress({}), null);
  assert.equal(F.formatAddress(null), null);
});

// ---------- what the stamp prints ----------

const US = { dateStyle: 'mdy', clock: '12', units: 'ft' };
const base = () => ({ ...C.defaultStamp(US), note: 'Kitchen subfloor' });
const time = new Date(2026, 10, 22, 14, 5, 9).getTime();
const place = { lat: 41.881832, lng: -87.623177, altitude: 182.3, address: '1420 Elm St, Springfield, IL 62704' };
const ctx = (o = {}) => ({ time, place, jobName: 'Miller kitchen', company: 'Reyes Home Repair', pro: true, hasLogo: true, ...o });

test('templates: Compact is one line, Standard three, Full every line that is on', () => {
  const compact = C.stampLines({ ...base(), template: 'compact' }, ctx());
  assert.deepEqual(compact.lines, ['Nov 22, 2026  2:05 PM  ·  1420 Elm St, Springfield, IL 62704']);
  assert.equal(compact.logo, false, 'no logo on Compact');
  const standard = C.stampLines({ ...base(), template: 'standard' }, ctx());
  assert.deepEqual(standard.lines, ['Nov 22, 2026  2:05 PM', '1420 Elm St, Springfield, IL 62704', 'Miller kitchen  ·  Kitchen subfloor']);
  assert.equal(standard.logo, true);
  assert.equal(standard.map, false, 'the map is Full only');
  const s = base();
  s.template = 'full';
  s.show = { ...s.show, altitude: true, map: true };
  const full = C.stampLines(s, ctx());
  assert.deepEqual(full.lines, ['Nov 22, 2026  2:05 PM', '1420 Elm St, Springfield, IL 62704', '41.88183° N, 87.62318° W  ·  Alt 598 ft', 'Miller kitchen', 'Reyes Home Repair', 'Kitchen subfloor']);
  assert.equal(full.map, true);
});

test('lines can each be switched off', () => {
  const s = { ...base(), template: 'full' };
  s.show = { ...s.show, date: false, address: false, coords: true, job: false, note: false, company: false, seconds: true };
  assert.deepEqual(C.stampLines(s, ctx()).lines, ['2:05 PM', '41.88183° N, 87.62318° W']);
  s.show = { ...s.show, time: false, coords: false };
  assert.deepEqual(C.stampLines(s, ctx()).lines, []);
  const sec = { ...base(), template: 'compact', seconds: true, clock: '24' };
  assert.equal(C.stampLines(sec, ctx()).lines[0].startsWith('Nov 22, 2026  14:05:09'), true);
});

test('fallback: a fix but no address (no signal) prints the coordinates in its place, and nothing else', () => {
  const noAddr = ctx({ place: { ...place, address: null } });
  assert.deepEqual(C.stampLines({ ...base(), template: 'compact' }, noAddr).lines, ['Nov 22, 2026  2:05 PM  ·  41.88183° N, 87.62318° W']);
  assert.deepEqual(C.stampLines({ ...base(), template: 'standard' }, noAddr).lines, ['Nov 22, 2026  2:05 PM', '41.88183° N, 87.62318° W', 'Miller kitchen  ·  Kitchen subfloor']);
  // Full: the coordinates appear once, not twice.
  const full = C.stampLines({ ...base(), template: 'full' }, noAddr).lines;
  assert.equal(full.filter((l) => l.includes('41.88183')).length, 1);
  // Even with the coordinates line off, they stand in for the missing address.
  const s = { ...base(), template: 'standard' };
  s.show = { ...s.show, coords: false };
  assert.equal(C.stampLines(s, noAddr).lines[1], '41.88183° N, 87.62318° W');
  for (const l of [...full, ...C.stampLines(s, noAddr).lines]) assert.doesNotMatch(l, /unavailable|unknown|no signal|no address/i);
});

test('fallback: no location at all (denied or no fix) prints the date and time only, with the job and note', () => {
  for (const p of [null, { lat: 0, lng: 0, altitude: null, address: null }, { lat: NaN, lng: 3, altitude: 5, address: 'x' }]) {
    assert.deepEqual(C.stampLines({ ...base(), template: 'compact' }, ctx({ place: p })).lines, ['Nov 22, 2026  2:05 PM']);
    assert.deepEqual(C.stampLines({ ...base(), template: 'standard' }, ctx({ place: p })).lines, ['Nov 22, 2026  2:05 PM', 'Miller kitchen  ·  Kitchen subfloor']);
    const full = C.stampLines({ ...base(), template: 'full', show: { ...base().show, map: true, altitude: true } }, ctx({ place: p }));
    assert.deepEqual(full.lines, ['Nov 22, 2026  2:05 PM', 'Miller kitchen', 'Reyes Home Repair', 'Kitchen subfloor']);
    assert.equal(full.map, false, 'no map without a place');
  }
  const bare = { ...base(), note: '' };
  bare.show = { ...bare.show, job: false };
  assert.deepEqual(C.stampLines({ ...bare, template: 'standard' }, ctx({ place: null })).lines, ['Nov 22, 2026  2:05 PM']);
});

test('an imported photo without its own date prints no date or time', () => {
  assert.deepEqual(C.stampLines({ ...base(), template: 'standard' }, ctx({ time: null })).lines, ['1420 Elm St, Springfield, IL 62704', 'Miller kitchen  ·  Kitchen subfloor']);
});

test('free stamps: no company, logo or map without Pro; every other line is free', () => {
  const s = { ...base(), template: 'full', show: { ...base().show, map: true, altitude: true } };
  const free = C.stampLines(s, ctx({ pro: false }));
  assert.equal(free.logo, false);
  assert.equal(free.map, false);
  assert.ok(!free.lines.includes('Reyes Home Repair'));
  assert.deepEqual(free.lines, ['Nov 22, 2026  2:05 PM', '1420 Elm St, Springfield, IL 62704', '41.88183° N, 87.62318° W  ·  Alt 598 ft', 'Miller kitchen', 'Kitchen subfloor']);
  assert.equal(C.stampLines(s, ctx({ hasLogo: false })).logo, false, 'no logo saved, none printed');
});

test('stored stamp settings: damaged or missing values take the default', () => {
  const d = C.defaultStamp(US);
  assert.deepEqual(C.parseStamp(null, d), d);
  assert.deepEqual(C.parseStamp('{not json', d), d);
  const p = C.parseStamp(JSON.stringify({ template: 'full', corner: 'middle', size: 'huge', clock: '24', show: { map: true, date: 'yes' }, note: 'x'.repeat(500) }), d);
  assert.equal(p.template, 'full');
  assert.equal(p.corner, d.corner);
  assert.equal(p.size, d.size);
  assert.equal(p.clock, '24');
  assert.equal(p.show.map, true);
  assert.equal(p.show.date, true);
  assert.equal(p.note.length, 120);
});

// ---------- layout ----------

const PHOTO = { width: 4032, height: 3024 };
const inside = (r, w, h) => r.x >= 0 && r.y >= 0 && r.x + r.w <= w + 0.01 && r.y + r.h <= h + 0.01;

test('layout: every template, corner and size stays inside the photo, on its corner, aligned to its edge', () => {
  for (const template of ['compact', 'standard', 'full'])
    for (const corner of C.CORNERS)
      for (const size of ['small', 'medium', 'large'])
        for (const dims of [PHOTO, { width: 3024, height: 4032 }, { width: 393, height: 524 }]) {
          const s = { ...base(), template, corner, size, show: { ...base().show, altitude: true, map: true } };
          const content = C.stampLines(s, ctx());
          const lay = L.layoutStamp({ lines: content.lines, width: dims.width, height: dims.height, corner, size, measure, logoAspect: content.logo ? 1 : null, map: content.map, singleLine: template === 'compact' });
          const tag = `${template} ${corner} ${size} ${dims.width}x${dims.height}`;
          assert.ok(inside(lay.box, dims.width, dims.height), `box inside: ${tag}`);
          for (const l of lay.lines) {
            assert.ok(l.x >= lay.box.x - 0.01 && l.x + l.width <= lay.box.x + lay.box.w + 0.01, `line inside the box: ${tag}`);
            assert.ok(l.y > lay.box.y && l.y < lay.box.y + lay.box.h + 0.01, `baseline inside the box: ${tag}`);
          }
          if (template === 'compact') assert.equal(lay.lines.length, 1, tag);
          const left = corner.endsWith('Left');
          const top = corner.startsWith('top');
          const margin = Math.min(dims.width, dims.height) * 0.035;
          assert.ok(Math.abs(left ? lay.box.x - margin : dims.width - margin - (lay.box.x + lay.box.w)) < 0.01, `on the ${left ? 'left' : 'right'} edge: ${tag}`);
          assert.ok(Math.abs(top ? lay.box.y - margin : dims.height - margin - (lay.box.y + lay.box.h)) < 0.01, `on the ${top ? 'top' : 'bottom'} edge: ${tag}`);
          assert.equal(lay.align, left ? 'left' : 'right');
          if (left) for (const l of lay.lines) assert.ok(Math.abs(l.x - lay.lines[0].x) < 0.01, `left aligned: ${tag}`);
          else for (const l of lay.lines) assert.ok(Math.abs(l.x + l.width - (lay.lines[0].x + lay.lines[0].width)) < 0.01, `right aligned: ${tag}`);
          if (lay.map) assert.ok(left ? lay.map.x <= lay.box.x + 0.01 : lay.map.x + lay.map.w >= lay.box.x + lay.box.w - 0.01, `map on the outer edge: ${tag}`);
          if (lay.logo) assert.ok(inside(lay.logo, dims.width, dims.height), `logo inside: ${tag}`);
        }
});

test('layout: the three sizes grow, and the preview is the photo scaled down', () => {
  const lines = ['Nov 22, 2026  2:05 PM', '1420 Elm St'];
  const sizes = ['small', 'medium', 'large'].map((size) => L.layoutStamp({ lines, ...PHOTO, corner: 'bottomLeft', size, measure }).fontSize);
  assert.ok(sizes[0] < sizes[1] && sizes[1] < sizes[2]);
  assert.equal(Math.round(sizes[1]), Math.round(3024 * 0.034));
  const big = L.layoutStamp({ lines, ...PHOTO, corner: 'bottomRight', size: 'medium', measure });
  const small = L.layoutStamp({ lines, width: 393, height: 3024 * (393 / 4032), corner: 'bottomRight', size: 'medium', measure });
  const k = 393 / 4032;
  assert.ok(Math.abs(small.box.x - big.box.x * k) < 0.5 && Math.abs(small.box.w - big.box.w * k) < 0.5, 'same place at preview scale');
});

test('layout: a long address wraps to two lines on Standard and is cut with an ellipsis on Compact', () => {
  const long = '1420 Westminster Boulevard North, Building C, Unit 14, Springfield Gardens, IL 62704';
  const narrow = { width: 1200, height: 1600 };
  const std = L.layoutStamp({ lines: [long], ...narrow, corner: 'bottomLeft', size: 'large', measure });
  assert.equal(std.lines.length, 2);
  assert.ok(std.lines.every((l) => l.x + l.width <= narrow.width));
  const cmp = L.layoutStamp({ lines: [long], ...narrow, corner: 'bottomLeft', size: 'large', measure, singleLine: true });
  assert.equal(cmp.lines.length, 1);
  assert.ok(cmp.lines[0].text.endsWith('…'));
  assert.ok(cmp.lines[0].x + cmp.lines[0].width <= narrow.width);
  assert.equal(L.fitText('short', 1000, 20, measure), 'short');
});

test('layout: no lines and no pictures takes no room', () => {
  const lay = L.layoutStamp({ lines: [], ...PHOTO, corner: 'topRight', size: 'small', measure });
  assert.equal(lay.lines.length, 0);
  assert.equal(lay.box.w, 0);
});

// ---------- the live place ----------

test('place: the geocoder is asked again only after moving or after a while; an address is used only near where it was looked up', () => {
  const fix = { lat: 41.8818, lng: -87.6232, altitude: null, accuracy: 5, at: 1000 };
  assert.equal(P.needsGeocode(null, fix, 1000), true);
  const looked = { lat: 41.8818, lng: -87.6232, address: '1420 Elm St', at: 1000 };
  assert.equal(P.needsGeocode(looked, fix, 60000), false);
  assert.equal(P.needsGeocode(looked, { ...fix, lat: 41.8822 }, 60000), true, '45 m away');
  assert.equal(P.needsGeocode(looked, fix, 1000 + 11 * 60000), true);
  assert.equal(P.needsGeocode({ ...looked, address: null }, fix, 1000 + 3 * 60000), true, 'a failed ask is tried again sooner');
  assert.equal(P.addressFor(looked, fix), '1420 Elm St');
  assert.equal(P.addressFor(looked, { ...fix, lat: 41.8828 }), null, '110 m away: coordinates instead');
  assert.equal(P.addressFor(null, fix), null);
  assert.equal(P.addressFor(looked, null), null);
  assert.ok(Math.abs(P.distanceMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }) - 111195) < 5);
  assert.equal(P.freshFix(fix, 1000 + 60000), fix);
  assert.equal(P.freshFix(fix, 1000 + 3 * 60000), null, 'a stale fix is not printed');
  assert.equal(P.mapStillGood({ lat: 41.8818, lng: -87.6232 }, fix), true);
  assert.equal(P.mapStillGood(null, fix), false);
});

// ---------- EXIF and imports ----------

test('exif: size, orientation, the capture date and GPS from a JPEG', () => {
  const info = X.readJpeg(new Uint8Array(readFileSync(new URL('./fixtures/rotated-exif6.jpg', import.meta.url))));
  assert.equal(info.width, 400);
  assert.equal(info.height, 300);
  assert.equal(info.orientation, 6);
  assert.deepEqual(X.uprightSize(info), { width: 300, height: 400 });
  assert.equal(info.takenAt, new Date(2026, 9, 4, 15, 42, 7).getTime());
  assert.ok(Math.abs(info.lat - (41 + 52 / 60 + 55.44 / 3600)) < 1e-9);
  assert.ok(Math.abs(info.lng + (87 + 37 / 60 + 41.52 / 3600)) < 1e-9);
  assert.ok(Math.abs(info.altitude - 182.34) < 1e-9);
  const plain = X.readJpeg(new Uint8Array(readFileSync(new URL('./fixtures/site-4032x3024.jpg', import.meta.url))));
  assert.deepEqual([plain.width, plain.height, plain.orientation, plain.takenAt, plain.lat], [4032, 3024, 1, null, null]);
  assert.equal(X.readJpeg(new Uint8Array([1, 2, 3, 4])), null);
  assert.equal(X.parseExifDate('0000:00:00 00:00:00'), null);
});

test('import: the file’s own date and place, the picker’s EXIF as fallback, and no date when neither has one', () => {
  const t = new Date(2026, 9, 4, 15, 42, 7).getTime();
  assert.deepEqual(I.importMeta({ takenAt: t, lat: 41.88, lng: -87.62, altitude: 182 }, null), { takenAt: t, lat: 41.88, lng: -87.62, altitude: 182 });
  const fromPicker = I.importMeta({ takenAt: null, lat: null, lng: null, altitude: null }, { DateTimeOriginal: '2026:10:04 15:42:07', '{GPS}': { Latitude: 33.86, LatitudeRef: 'S', Longitude: 151.2, LongitudeRef: 'E', Altitude: 12, AltitudeRef: 0 } });
  assert.deepEqual(fromPicker, { takenAt: t, lat: -33.86, lng: 151.2, altitude: 12 });
  assert.deepEqual(I.importMeta(null, {}), { takenAt: null, lat: null, lng: null, altitude: null });
  assert.deepEqual(I.importMeta(null, { GPSLatitude: 0, GPSLongitude: 0 }), { takenAt: null, lat: null, lng: null, altitude: null });
});
