// Checks for the identity, the config, the store listing, the website, the
// copy voice and the design files: the things a reviewer or a careless edit
// can break without the type checker noticing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(path.join(root, p), 'utf8');
const app = JSON.parse(read('app.json')).expo;
const eas = JSON.parse(read('eas.json'));
const meta = read('store/metadata.md');
const field = (label) => {
  const m = meta.match(new RegExp(`- ${label} \\((\\d+)\\): (.+)`));
  return m ? { n: Number(m[1]), v: m[2].trim() } : null;
};
const words = (s) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

function walk(dir, exts) {
  const out = [];
  for (const f of readdirSync(path.join(root, dir))) {
    const p = path.join(dir, f);
    if (statSync(path.join(root, p)).isDirectory()) out.push(...walk(p, exts));
    else if (exts.some((e) => f.endsWith(e))) out.push(p);
  }
  return out;
}

test('identity: name, slug, bundle id, version, build, owner, home screen name', () => {
  assert.equal(app.name, 'Timestamp Camera');
  assert.equal(app.slug, 'timestampcamera');
  assert.equal(app.ios.bundleIdentifier, 'com.bwk.timestampcamera');
  assert.equal(app.version, '1.0.0');
  assert.equal(app.ios.buildNumber, '1');
  assert.equal(app.owner, 'bkdeveloper123');
  assert.equal(app.ios.infoPlist.CFBundleDisplayName, 'Timestamp Cam');
  assert.equal(app.ios.supportsTablet, false);
  assert.equal(app.userInterfaceStyle, 'light');
});

test('values from Cowork: the RevenueCat key and App Store Connect id are in; only the Expo project id is still a marked placeholder', () => {
  assert.match(app.extra.revenueCatApiKeyIos, /^appl_[A-Za-z0-9]+$/);
  assert.equal(eas.submit.production.ios.ascAppId, '6838074080');
  assert.equal(app.extra.eas.projectId, 'COWORK_PLACEHOLDER_EXPO_PROJECT_ID');
  assert.equal(eas.cli.appVersionSource, 'local');
  assert.equal(eas.build.production.autoIncrement, false);
});

test('plugins: exactly three usage strings, location when in use only, push entitlement removed last', () => {
  const plugins = app.plugins.map((p) => (Array.isArray(p) ? p : [p, {}]));
  assert.equal(plugins[plugins.length - 1][0], './plugins/withoutPushEntitlement');
  const opt = (n) => plugins.find((p) => p[0] === n)?.[1];
  assert.match(opt('expo-camera').cameraPermission, /camera to take your job photos/);
  assert.equal(opt('expo-camera').microphonePermission, false);
  assert.match(opt('expo-location').locationWhenInUsePermission, /printed on each photo to show where it was taken/);
  for (const k of ['locationAlwaysAndWhenInUsePermission', 'locationAlwaysPermission', 'motionUsagePermission', 'isIosBackgroundLocationEnabled']) assert.equal(opt('expo-location')[k], false, k);
  assert.match(opt('expo-media-library').savePhotosPermission, /Saves copies/);
  assert.equal(opt('expo-media-library').photosPermission, false);
  assert.equal(opt('expo-image-picker').photosPermission, false);
  assert.equal(opt('expo-image-picker').cameraPermission, false);
  assert.ok(!JSON.stringify(app).includes('UIBackgroundModes'));
});

test('purchases: product ids, entitlement and the engine file', () => {
  const p = read('src/purchases.ts');
  assert.match(p, /export const ENTITLEMENT_ID = 'pro';/);
  assert.match(p, /checkPro/, 'the foreground Pro re-check is there');
  assert.match(read('src/state.tsx'), /checkPro\(\)\.then/);
  for (const id of ['camera_pro_weekly', 'camera_pro_yearly', 'camera_pro_lifetime', '$rc_weekly', '$rc_annual', '$rc_lifetime']) assert.ok(meta.includes(id), id);
  assert.match(read('src/screens/Paywall.tsx'), /Restore purchases/);
  assert.match(read('src/screens/Paywall.tsx'), /ONBOARDING_CLOSE_DELAY_MS = 3000/);
});

test('listing: names, subtitles and keywords fit, and no keyword repeats a word of the name or subtitle', () => {
  const name = field('Name');
  const sub = field('Subtitle');
  assert.equal(name.v, 'Timestamp Camera: Job Photos');
  assert.equal(sub.v, 'GPS Map Camera, Time Stamp');
  assert.equal(name.v.length, name.n);
  assert.equal(sub.v.length, sub.n);
  assert.ok(name.n <= 30 && sub.n <= 30);
  const kw = field('Keywords');
  assert.equal(kw.v, 'date,photo,geotag,punch,list,site,report,proof,work,before,after,location,address,stamper,field,free');
  assert.equal(kw.v.length, kw.n);
  assert.ok(kw.v.length <= 100);
  const taken = new Set([...words(name.v), ...words(sub.v)]);
  for (const k of kw.v.split(',')) assert.ok(!taken.has(k), `keyword ${k} repeats the name or subtitle`);
  assert.equal(new Set(kw.v.split(',')).size, kw.v.split(',').length, 'no repeats');
  const es = meta.slice(meta.indexOf('## Spanish'));
  const esName = es.match(/- Name \((\d+)\): (.+)/);
  const esSub = es.match(/- Subtitle \((\d+)\): (.+)/);
  assert.equal(esName[2], 'GPS Camera: Date Stamp Photos');
  assert.equal(esName[2].length, Number(esName[1]));
  assert.equal(esSub[2], 'Timestamp, Geotag & Location');
  assert.equal(esSub[2].length, Number(esSub[1]));
  const esKw = es.match(/- Keywords: (.+)/)[1].trim();
  assert.ok(esKw.length <= 100);
  const promo = meta.match(/## Promotional text \(170 max\)\n\n(.+)\n/)[1];
  assert.ok(promo.length <= 170, `${promo.length}`);
  assert.match(meta, /Primary category: Photo & Video\. Secondary: Business\./);
  assert.match(meta, /Age rating: 4\+/);
  assert.match(meta, /Data collected: Purchases/);
  assert.match(meta, /paywall appears .*close button \(X\) appears after 3 seconds/);
});

// ---------- copy voice ----------

const userFacing = [...walk('src', ['.ts', '.tsx']), 'App.tsx', 'index.ts', ...walk('docs', ['.html']), 'store/metadata.md'];

test('copy voice: none of the banned words, no exclamation marks, no em dashes', () => {
  const banned = /\b(unlock|premium|seamless|effortless|welcome)\b|\blet['’]s\b/i;
  for (const f of [...userFacing, 'NOTES.md', 'README.md', 'docs/design/NOTES.md']) {
    const s = read(f);
    assert.ok(!s.includes('—'), `em dash in ${f}`);
    // In code, only what people read: quoted text and JSX text (not identifiers, not the ! operator).
    const prose = f.endsWith('.ts') || f.endsWith('.tsx') ? (s.match(/(['"`])(?:(?!\1)[^\n\\])*\1|>[^<>{}\n]+</g) ?? []).join('\n') : s.replace(/<!DOCTYPE[^>]*>|<!--[\s\S]*?-->/g, '');
    prose.split('\n').forEach((line, i) => assert.doesNotMatch(line, banned, `${f}: ${line}`));
    assert.doesNotMatch(prose, /[A-Za-z0-9.)]![ \n"'`<]/, `exclamation mark in ${f}`);
  }
});

test('the stamp is never called tamper-proof, legal proof or verified', () => {
  for (const f of userFacing)
    read(f)
      .split('\n')
      .forEach((line, i) => {
        if (/never/i.test(line)) return; // the guardrail itself
        assert.doesNotMatch(line, /\btamper|legal proof|\bverified|certif/i, `${f}:${i + 1}`);
      });
});

test('no brand names in the app or the listing text', () => {
  const brands = /\b(google|samsung|android|instagram|facebook|whatsapp|procore|companycam|dropbox|gps map camera app|timemark|solocator)\b/i;
  for (const f of [...walk('src', ['.ts', '.tsx']), 'App.tsx']) assert.doesNotMatch(read(f).replace(/\/\/.*|\/\*[\s\S]*?\*\//g, ''), brands, f);
  const listing = meta.slice(meta.indexOf('## Promotional text'), meta.indexOf("## What's New"));
  assert.doesNotMatch(listing, brands);
  assert.doesNotMatch(listing, /\bApple Maps\b|RevenueCat/);
});

// ---------- website ----------

test('website: landing, privacy, support with an FAQ, sitemap and robots; the support address; nothing from Estimate Maker', () => {
  for (const f of ['index.html', 'privacy.html', 'support.html', 'sitemap.xml', 'robots.txt', 'style.css', 'icon-512.png', 'apple-touch-icon.png', 'og-image.png']) assert.ok(existsSync(path.join(root, 'docs', f)), f);
  const index = read('docs/index.html');
  assert.match(index, /apps\.apple\.com\/app\/id6838074080/);
  const privacy = read('docs/privacy.html');
  assert.match(privacy, /Purchases, not linked to you, not used for tracking/);
  assert.match(privacy, /only while the app is open, never in the background/);
  assert.match(read('docs/support.html'), /class="faq"/);
  for (const f of ['index.html', 'privacy.html', 'support.html', 'sitemap.xml', 'robots.txt']) {
    const s = read(`docs/${f}`);
    assert.doesNotMatch(s, /estimatemaker|Estimate Maker/i, f);
    for (const m of s.matchAll(/(?:src|href)="([^"]+)"/g)) {
      const u = m[1];
      if (/^(https?:|mailto:|#)/.test(u) || u === './') continue;
      assert.ok(existsSync(path.join(root, 'docs', u)), `${f} links to missing ${u}`);
    }
  }
  assert.match(read('src/links.ts'), /bkdigitalleads@gmail\.com/);
  assert.match(read('src/links.ts'), /github\.io\/timestampcamera\/privacy\.html/);
});

// ---------- design files ----------

test('design: the renders at 393x852 points (2x), the icon options, the report sample and the stamp proof image', () => {
  const png = (f) => {
    const b = readFileSync(path.join(root, f));
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  };
  const after = readdirSync(path.join(root, 'docs/design/after')).filter((f) => f.endsWith('.png'));
  for (const want of ['camera', 'stamp-editor', 'photo-stamped', 'jobs', 'job-photo-days', 'before-after', 'punch-list', 'report-preview', 'paywall-onboarding', 'paywall-in-app', 'settings', 'onboarding-1']) assert.ok(after.some((f) => f.includes(want)), want);
  for (const f of after) assert.deepEqual(png(`docs/design/after/${f}`), { w: 786, h: 1704 }, f);
  assert.ok(existsSync(path.join(root, 'docs/design/icon-options.png')));
  assert.ok(existsSync(path.join(root, 'docs/design/stamp-proof.jpg')));
  assert.ok(readdirSync(path.join(root, 'docs/design/report')).length >= 3);
  // No icon is picked: store/icon.js has no CHOSEN, and assets/icon.png is the placeholder.
  assert.doesNotMatch(read('store/icon.js'), /const CHOSEN =/);
  assert.match(read('docs/design/NOTES.md'), /None is picked; Brian picks/);
});

test('design: ink on the yellow main button and on the light background is well above 4.5:1', () => {
  const lum = (hex) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const t = read('src/theme.ts');
  const tok = (k) => t.match(new RegExp(`${k}: '(#[0-9A-F]{6})'`))[1];
  assert.ok(ratio(tok('onAccent'), tok('accent')) > 10);
  assert.ok(ratio(tok('ink'), tok('bg')) > 12);
  assert.ok(ratio(tok('inkSoft'), tok('bg')) > 5.5);
  assert.ok(ratio(tok('chromeInk'), tok('chrome')) > 12);
  assert.ok(ratio(tok('chromeSoft'), tok('chrome')) > 6);
});

test('fonts: only the bundled Barlow files, each under the SIL OFL', () => {
  const fonts = readdirSync(path.join(root, 'assets/fonts'));
  assert.deepEqual(fonts.filter((f) => f.endsWith('.ttf')).sort(), ['Barlow-Regular.ttf', 'Barlow-SemiBold.ttf', 'BarlowCondensed-SemiBold.ttf']);
  assert.match(read('assets/fonts/OFL-Barlow.txt'), /SIL Open Font License/);
});
