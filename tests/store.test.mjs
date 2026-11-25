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
  assert.equal(app.ios.buildNumber, '4');
  assert.equal(app.owner, 'bkdeveloper123');
  assert.equal(app.ios.infoPlist.CFBundleDisplayName, 'Timestamp Cam');
  assert.equal(app.ios.supportsTablet, false);
  assert.equal(app.userInterfaceStyle, 'light');
});

test('values from Cowork: the RevenueCat key, the App Store Connect id and the Expo project id are in, and no placeholder is left anywhere', () => {
  assert.match(app.extra.revenueCatApiKeyIos, /^appl_[A-Za-z0-9]+$/);
  assert.equal(eas.submit.production.ios.ascAppId, '6838074080');
  assert.equal(app.extra.eas.projectId, 'ad880069-1f10-49d0-bcf5-b05c86bbe8e3');
  assert.equal(app.owner, 'bkdeveloper123');
  assert.equal(app.slug, 'timestampcamera');
  const token = ['COWORK', 'PLACEHOLDER'].join('_');
  const files = ['app.json', 'eas.json', 'App.tsx', 'index.ts', 'CLAUDE.md', 'README.md', 'store/metadata.md', ...walk('src', ['.ts', '.tsx']), ...walk('docs', ['.html', '.md', '.xml', '.txt']), ...walk('tests', ['.mjs'])];
  for (const f of files) assert.ok(!read(f).includes(token), `placeholder left in ${f}`);
  assert.equal(eas.cli.appVersionSource, 'local');
  assert.equal(eas.build.production.autoIncrement, false);
});

test('plugins: exactly four usage strings (camera, location when in use, add to Photos, motion), no background location, push entitlement removed last', () => {
  const plugins = app.plugins.map((p) => (Array.isArray(p) ? p : [p, {}]));
  assert.equal(plugins[plugins.length - 1][0], './plugins/withoutPushEntitlement');
  const opt = (n) => plugins.find((p) => p[0] === n)?.[1];
  assert.match(opt('expo-camera').cameraPermission, /camera to take your job photos/);
  assert.equal(opt('expo-camera').microphonePermission, false);
  assert.match(opt('expo-location').locationWhenInUsePermission, /printed on each photo to show where it was taken/);
  for (const k of ['locationAlwaysAndWhenInUsePermission', 'locationAlwaysPermission', 'isIosBackgroundLocationEnabled']) assert.equal(opt('expo-location')[k], false, k);
  // Build 1 was rejected at processing (ITMS-90683): expo-location links CMMotionActivityManager, which needs
  // NSMotionUsageDescription. The plugin's option must carry the string (false deletes the key after infoPlist is applied).
  const motion = 'Timestamp Camera uses motion to tell which way the phone is held, so photos are saved the right way up.';
  assert.equal(opt('expo-location').motionUsagePermission, motion);
  assert.equal(app.ios.infoPlist.NSMotionUsageDescription, motion);
  // The only purpose strings in infoPlist are the motion one; the others come from the plugins above.
  assert.deepEqual(Object.keys(app.ios.infoPlist).filter((k) => /UsageDescription$/.test(k)), ['NSMotionUsageDescription']);
  // Strings the app does not need and must not carry: it never records audio, never reads the library itself, never tracks.
  const all = JSON.stringify(app);
  for (const k of ['NSMicrophoneUsageDescription', 'NSPhotoLibraryUsageDescription', 'NSUserTrackingUsageDescription', 'NSBluetoothAlwaysUsageDescription', 'NSContactsUsageDescription', 'NSCalendarsUsageDescription', 'NSLocationAlwaysAndWhenInUseUsageDescription']) assert.ok(!all.includes(k), k);
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
  assert.equal(kw.v, 'date,photo,geotag,punch,list,site,report,proof,work,before,after,location,address,stamper,field,log');
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

test('extra listings indexed for US search: eight, each name and subtitle 30 characters or fewer, each keyword field 100 bytes or fewer with no spaces', () => {
  const sec = meta.slice(meta.indexOf('## Extra listings indexed for US search'));
  const body = sec.slice(0, sec.indexOf('\n## ', 5) === -1 ? undefined : sec.indexOf('\n## ', 5));
  const rows = body
    .split('\n')
    .filter((l) => l.startsWith('| ') && !l.startsWith('| Listing') && !l.startsWith('| ---'))
    .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
  assert.deepEqual(
    rows.map((r) => r[0]),
    ['Arabic', 'French', 'Korean', 'Portuguese (Brazil)', 'Russian', 'Vietnamese', 'Chinese (Simplified)', 'Chinese (Traditional)']
  );
  for (const [listing, name, subtitle, keywords] of rows) {
    assert.ok(name.length > 0 && name.length <= 30, `${listing} name is ${name.length} characters`);
    assert.ok(subtitle.length > 0 && subtitle.length <= 30, `${listing} subtitle is ${subtitle.length} characters`);
    assert.ok(Buffer.byteLength(keywords, 'utf8') <= 100, `${listing} keywords are ${Buffer.byteLength(keywords, 'utf8')} bytes`);
    assert.ok(!/\s/.test(keywords), `${listing} keywords have a space`);
    assert.ok(keywords.split(',').every((k) => k.length > 0), `${listing} keywords have an empty entry`);
  }
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

test('privacy wording: photos stay on the phone, the Apple lookups are disclosed, and nothing claims more', () => {
  assert.match(meta, /\nYOUR PHOTOS STAY ON YOUR PHONE\n- No account and no server of ours\. Photos and reports stay on your iPhone until you share them\.\n/);
  assert.doesNotMatch(meta, /NOTHING LEAVES THE PHONE/);
  // The privacy label stays Purchases only, and the review note says what goes to Apple.
  assert.match(meta, /- Data collected: Purchases \(Purchase History\), through RevenueCat\./);
  assert.match(meta, /the coordinates go to Apple for that lookup/);
  assert.match(read('docs/support.html'), /Apple's location service, which receives the coordinates/);
  assert.match(read('src/screens/StampEditor.tsx'), /Looked up by Apple’s location service, which receives the coordinates\. Off: no lookup\./);
  // No claim that nothing leaves the phone, that nothing is uploaded, or that locations stay on it.
  const claims = /nothing leaves|nothing is uploaded|never leaves? (?:the|this|your) (?:phone|device|iphone)|locations? (?:and [a-z]+ )?stays? on|locations?,[^.]*stay on|stays on (?:this|your) phone\.?"|It stays on your phone/i;
  for (const f of [...userFacing, 'README.md', 'app.json', 'CLAUDE.md', 'NOTES.md'])
    read(f)
      .split('\n')
      .forEach((line, i) => {
        if (/Never write that|old wording|was not accurate/.test(line)) return; // the rule itself, and the log of the fix
        assert.doesNotMatch(line, claims, `${f}:${i + 1}`);
      });
});

// ---------- website ----------

test('website: landing, privacy, support with an FAQ, sitemap and robots; the support address; nothing from Estimate Maker', () => {
  for (const f of ['index.html', 'privacy.html', 'support.html', 'sitemap.xml', 'robots.txt', 'style.css', 'icon-512.png', 'apple-touch-icon.png', 'og-image.png']) assert.ok(existsSync(path.join(root, 'docs', f)), f);
  const index = read('docs/index.html');
  assert.match(index, /apps\.apple\.com\/app\/id6838074080/);
  const privacy = read('docs/privacy.html');
  assert.match(privacy, /Purchases, not linked to you, not used for tracking/);
  assert.match(privacy, /only while the app is open, never in the background/);
  // Said plainly: address lookup and the optional map use Apple's services, and Apple receives the coordinates.
  assert.match(privacy, /<h2>What goes to Apple<\/h2>/);
  assert.match(privacy, /Apple's location service to look up the coordinates/);
  assert.match(privacy, /Apple receives those coordinates for that lookup/);
  assert.match(privacy, /Turn the Address line off and no lookup is made/);
  assert.match(privacy, /loads from Apple Maps, so Apple receives the area being shown/);
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
  assert.ok(existsSync(path.join(root, 'docs/design/icon-options-2.png')), 'the second round, A to D');
  assert.ok(existsSync(path.join(root, 'docs/design/icon-options-3.png')), 'the third round, A refined');
  assert.ok(existsSync(path.join(root, 'docs/design/stamp-proof.jpg')));
  assert.ok(readdirSync(path.join(root, 'docs/design/report')).length >= 3);
  // Brian's pick: A3 yellow, named in store/icon.js so `node icon.js` regenerates every icon file.
  assert.match(read('store/icon.js'), /const CHOSEN = 'A3-yellow';/);
});

test('icon: A3 yellow at every size; assets/icon.png is 1024x1024 RGB with no alpha and square corners', () => {
  const info = (f) => {
    const b = readFileSync(path.join(root, f));
    assert.equal(b.toString('latin1', 1, 4), 'PNG', f);
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), colorType: b[25] };
  };
  // PNG color type 2 is RGB (no alpha); 6 is RGBA.
  assert.deepEqual(info('assets/icon.png'), { w: 1024, h: 1024, colorType: 2 });
  assert.deepEqual(info('assets/favicon.png'), { w: 48, h: 48, colorType: 2 });
  assert.deepEqual(info('docs/icon-512.png'), { w: 512, h: 512, colorType: 2 });
  assert.deepEqual(info('docs/apple-touch-icon.png'), { w: 180, h: 180, colorType: 2 });
  assert.equal(info('assets/splash-icon.png').w, 400);
  assert.equal(info('assets/android-icon-foreground.png').w, 1024);
  assert.equal(app.icon, './assets/icon.png');
  assert.equal(app.android.adaptiveIcon.backgroundColor, '#15181B');
  assert.match(read('docs/design/NOTES.md'), /Chosen: A3 yellow/);
  for (const f of ['index.html', 'privacy.html', 'support.html']) assert.match(read(`docs/${f}`), /app icon: a photo with a yellow tag/);
});

test('store screenshots: six at 1320x2868 and six at 1206x2622, the paywall at 1179x2556, all RGB PNG with no alpha', () => {
  const info = (f) => {
    const b = readFileSync(path.join(root, 'store/screenshots', f));
    assert.equal(b.toString('latin1', 1, 4), 'PNG', f);
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), colorType: b[25] };
  };
  for (let i = 1; i <= 6; i++) {
    assert.deepEqual(info(`67-${i}.png`), { w: 1320, h: 2868, colorType: 2 }, `67-${i}`);
    assert.deepEqual(info(`61-${i}.png`), { w: 1206, h: 2622, colorType: 2 }, `61-${i}`);
  }
  assert.deepEqual(info('paywall-review.png'), { w: 1179, h: 2556, colorType: 2 });
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
