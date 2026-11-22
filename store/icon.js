const sharp = require('sharp');
const path = require('path');

// Timestamp Camera's icon concepts. Brian picks; none is chosen here.
// `node icon.js` writes docs/design/icon-options.png: three concepts in the
// app's palette (camera chrome, hi-vis yellow, white), each large and at
// 60 px on a light and a dark wallpaper.
//   corner  - a photo with the stamp block printed in its bottom corner
//   pin     - a map pin whose head is a clock face, on hi-vis yellow
//   shutter - the app's yellow shutter ring over three stamp lines
// No brand marks, no letters, no hard hat. Until one is picked, assets/icon.png
// is a plain placeholder (a dark tile with a thin frame); `node icon.js ship <name>`
// writes the picked concept to assets/ (icon, splash, Android foreground,
// favicon) and the website's icons.
// `node icon.js options2` writes docs/design/icon-options-2.png, the second
// round (A to D) after Brian's notes on the first three. Not wired to `ship` until one is picked.
const ROOT = path.join(__dirname, '..');
const CHROME = '#15181B';
const RAISED = '#2A3036';
const YELLOW = '#FFC61A';
const WHITE = '#F4F5F2';

const CONCEPTS = {
  corner: (bg = true) => `
    ${bg ? `<rect width="1024" height="1024" fill="${CHROME}"/>` : ''}
    <rect x="170" y="230" width="684" height="564" rx="44" fill="${WHITE}"/>
    <rect x="206" y="266" width="612" height="492" rx="18" fill="#7FA9D6"/>
    <path d="M206 640 L380 470 L500 580 L610 450 L818 640 L818 740 Q818 758 800 758 L224 758 Q206 758 206 740 Z" fill="#4D7A52"/>
    <circle cx="700" cy="360" r="46" fill="${WHITE}" opacity="0.9"/>
    <rect x="236" y="586" width="300" height="146" rx="14" fill="${CHROME}" opacity="0.92"/>
    <rect x="262" y="612" width="210" height="22" rx="11" fill="${YELLOW}"/>
    <rect x="262" y="650" width="248" height="16" rx="8" fill="${WHITE}"/>
    <rect x="262" y="682" width="170" height="16" rx="8" fill="${WHITE}"/>`,
  pin: (bg = true) => `
    ${bg ? `<rect width="1024" height="1024" fill="${YELLOW}"/>` : ''}
    <path d="M512 880 C512 880 250 610 250 430 A262 262 0 0 1 774 430 C774 610 512 880 512 880 Z" fill="${CHROME}"/>
    <circle cx="512" cy="430" r="168" fill="${WHITE}"/>
    <path d="M512 430 L512 318 M512 430 L592 478" stroke="${CHROME}" stroke-width="34" stroke-linecap="round"/>
    <circle cx="512" cy="430" r="22" fill="${CHROME}"/>`,
  shutter: (bg = true) => `
    ${bg ? `<rect width="1024" height="1024" fill="${CHROME}"/>` : ''}
    <circle cx="512" cy="430" r="250" fill="none" stroke="${YELLOW}" stroke-width="54"/>
    <circle cx="512" cy="430" r="182" fill="${WHITE}"/>
    <rect x="262" y="752" width="340" height="40" rx="20" fill="${YELLOW}"/>
    <rect x="262" y="816" width="500" height="30" rx="15" fill="${WHITE}"/>
    <rect x="262" y="868" width="380" height="30" rx="15" fill="${RAISED}"/>`,
};

// ---------- second round (Nov 22, 2026, after Brian's look at the first three) ----------
// Notes from Brian: corner is closest because it reads as a photo, but none says "camera that
// stamps time and place" at a glance. Search results for timestamp camera are mostly white tiles
// with a lens, and one is a yellow tile with a black camera: so no yellow background, no white
// tile with a lens and color stripe. Dark background, yellow (or safety orange) as an accent only.
const ORANGE = '#FF6A13';
const GLASS = '#0B0D0F';

/** A clock face: a disc with two hands. */
const clock = (cx, cy, r, face, hands) => `
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="${face}"/>
  <path d="M${cx} ${cy} L${cx} ${cy - r * 0.62} M${cx} ${cy} L${cx + r * 0.5} ${cy + r * 0.28}" stroke="${hands}" stroke-width="${r * 0.2}" stroke-linecap="round"/>
  <circle cx="${cx}" cy="${cy}" r="${r * 0.13}" fill="${hands}"/>`;

/** A location pin, `h` tall, its point at (cx, cy + h/2). */
const pin = (cx, cy, h, fill, hole) => {
  const r = h * 0.36;
  const top = cy - h / 2 + r;
  return `<path d="M${cx} ${cy + h / 2} C${cx} ${cy + h / 2} ${cx - r} ${top + r * 0.95} ${cx - r} ${top} A${r} ${r} 0 0 1 ${cx + r} ${top} C${cx + r} ${top + r * 0.95} ${cx} ${cy + h / 2} ${cx} ${cy + h / 2} Z" fill="${fill}"/>
  <circle cx="${cx}" cy="${top}" r="${r * 0.42}" fill="${hole}"/>`;
};

/** Digits drawn as segments, like a job-site clock; ':' as two squares. No font, so no letters can slip in. */
const SEGS = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
function digits(str, x, y, h, fill) {
  const w = h * 0.55;
  const t = h * 0.15;
  let out = '';
  let cx = x;
  for (const ch of str) {
    if (ch === ':') {
      out += `<rect x="${cx}" y="${y + h * 0.26}" width="${t}" height="${t}" rx="${t * 0.2}" fill="${fill}"/><rect x="${cx}" y="${y + h * 0.62}" width="${t}" height="${t}" rx="${t * 0.2}" fill="${fill}"/>`;
      cx += t + h * 0.14;
      continue;
    }
    // A 1 is only as wide as its stroke, like on a real clock.
    const narrow = ch === '1';
    const bx = narrow ? cx : cx + w - t;
    const seg = {
      a: [cx + t * 0.6, y, w - t * 1.2, t],
      b: [bx, y + t * 0.6, t, h / 2 - t * 0.9],
      c: [bx, y + h / 2 + t * 0.3, t, h / 2 - t * 0.9],
      d: [cx + t * 0.6, y + h - t, w - t * 1.2, t],
      e: [cx, y + h / 2 + t * 0.3, t, h / 2 - t * 0.9],
      f: [cx, y + t * 0.6, t, h / 2 - t * 0.9],
      g: [cx + t * 0.6, y + h / 2 - t / 2, w - t * 1.2, t],
    };
    for (const k of SEGS[ch]) {
      const [sx, sy, sw, sh] = seg[k];
      out += `<rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" rx="${t * 0.35}" fill="${fill}"/>`;
    }
    cx += (narrow ? t : w) + h * 0.14;
  }
  return out;
}
const digitsWidth = (str, h) => [...str].reduce((s, ch) => s + (ch === ':' || ch === '1' ? h * 0.15 + h * 0.14 : h * 0.55 + h * 0.14), 0) - h * 0.14;

/** A small scene inside a photo: sky, a hill and a sun. */
const scene = (x, y, w, h, r) => `
  <clipPath id="ph${x}${y}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/></clipPath>
  <g clip-path="url(#ph${x}${y})">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#7FA9D6"/>
    <circle cx="${x + w * 0.78}" cy="${y + h * 0.22}" r="${h * 0.09}" fill="${WHITE}" opacity="0.9"/>
    <path d="M${x} ${y + h * 0.62} L${x + w * 0.28} ${y + h * 0.34} L${x + w * 0.5} ${y + h * 0.55} L${x + w * 0.7} ${y + h * 0.3} L${x + w} ${y + h * 0.6} L${x + w} ${y + h} L${x} ${y + h} Z" fill="#4D7A52"/>
  </g>`;

const CONCEPTS_2 = {
  A: {
    name: 'Photo with its stamp',
    note: 'Corner, clearer: the stamp block holds a clock and a pin beside two lines.',
    draw: (bg = true) => `
      ${bg ? `<rect width="1024" height="1024" fill="${CHROME}"/>` : ''}
      <rect x="150" y="190" width="724" height="644" rx="46" fill="${WHITE}"/>
      ${scene(186, 226, 652, 572, 20)}
      <rect x="206" y="520" width="560" height="248" rx="26" fill="${CHROME}"/>
      ${clock(282, 594, 50, YELLOW, CHROME)}
      ${pin(282, 700, 104, YELLOW, CHROME)}
      <rect x="370" y="568" width="300" height="40" rx="20" fill="${WHITE}"/>
      <rect x="370" y="642" width="350" height="34" rx="17" fill="${WHITE}" opacity="0.85"/>
      <rect x="370" y="706" width="230" height="34" rx="17" fill="${WHITE}" opacity="0.6"/>`,
  },
  B: {
    name: 'Camera with a stamp strip',
    note: 'A camera from the front; under the lens, a strip with a clock, a pin and two lines.',
    draw: (bg = true) => `
      ${bg ? `<rect width="1024" height="1024" fill="${CHROME}"/>` : ''}
      <rect x="380" y="214" width="264" height="110" rx="30" fill="${RAISED}"/>
      <rect x="150" y="290" width="724" height="520" rx="70" fill="${RAISED}"/>
      <rect x="200" y="330" width="92" height="44" rx="14" fill="${YELLOW}"/>
      <circle cx="512" cy="460" r="152" fill="${CHROME}"/>
      <circle cx="512" cy="460" r="134" fill="none" stroke="${YELLOW}" stroke-width="30"/>
      <circle cx="512" cy="460" r="90" fill="${GLASS}"/>
      <circle cx="476" cy="424" r="26" fill="${WHITE}" opacity="0.5"/>
      <rect x="196" y="640" width="632" height="138" rx="30" fill="${CHROME}"/>
      ${clock(268, 709, 46, YELLOW, CHROME)}
      ${pin(380, 709, 100, YELLOW, CHROME)}
      <rect x="452" y="676" width="320" height="30" rx="15" fill="${WHITE}"/>
      <rect x="452" y="720" width="230" height="26" rx="13" fill="${WHITE}" opacity="0.7"/>`,
  },
  C: {
    name: 'Photo with a time tag',
    note: 'A framed photo with a bright safety orange tag: 09:41 and a pin. Digits only, no letters.',
    draw: (bg = true) => {
      const h = 132;
      const tw = digitsWidth('09:41', h);
      return `
      ${bg ? `<rect width="1024" height="1024" fill="${CHROME}"/>` : ''}
      <rect x="170" y="150" width="684" height="610" rx="44" fill="${WHITE}"/>
      ${scene(204, 184, 616, 542, 20)}
      <rect x="110" y="600" width="804" height="236" rx="34" fill="${ORANGE}"/>
      ${(() => {
        // Time and pin centred on the tag.
        const pinW = 150 * 0.72;
        const x0 = 512 - (tw + 60 + pinW) / 2;
        return digits('09:41', x0, 718 - h / 2, h, CHROME) + pin(x0 + tw + 60 + pinW / 2, 718, 150, CHROME, ORANGE);
      })()}`;
    },
  },
  D: {
    name: 'Lens with a pin and a clock',
    note: 'A lens ring with a location pin inside and a clock badge on its corner.',
    draw: (bg = true) => `
      ${bg ? `<rect width="1024" height="1024" fill="${CHROME}"/>` : ''}
      <circle cx="480" cy="480" r="300" fill="${RAISED}"/>
      <circle cx="480" cy="480" r="262" fill="none" stroke="${YELLOW}" stroke-width="44"/>
      <circle cx="480" cy="480" r="214" fill="${GLASS}"/>
      ${pin(480, 474, 290, WHITE, GLASS)}
      <circle cx="768" cy="768" r="150" fill="${CHROME}"/>
      ${clock(768, 768, 122, YELLOW, CHROME)}`,
  },
};

const svg = (inner, size = 1024) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">${inner}</svg>`;

async function png(name, size) {
  return sharp(Buffer.from(svg(CONCEPTS[name](), size))).resize(size, size).png().toBuffer();
}

async function options() {
  const names = Object.keys(CONCEPTS);
  const W = 1500;
  const H = 880;
  const col = W / names.length;
  const parts = [];
  const label = (s, x, y, size, fill = '#15181B', weight = 600) => `<text x="${x}" y="${y}" font-family="DejaVu Sans, Arial" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="middle">${s}</text>`;
  let overlay = `<rect width="${W}" height="${H}" fill="#F3F4F1"/>`;
  overlay += label('Timestamp Camera: three icon concepts. Brian picks one.', W / 2, 58, 30);
  names.forEach((n, i) => {
    const cx = col * i + col / 2;
    overlay += label(n, cx, 520, 28);
    overlay += label('60 px on a light and a dark wallpaper', cx, 556, 18, '#545A60', 400);
    overlay += `<rect x="${cx - 200}" y="590" width="190" height="190" rx="18" fill="#DDE3EA"/>`;
    overlay += `<rect x="${cx + 10}" y="590" width="190" height="190" rx="18" fill="#1B2430"/>`;
  });
  overlay += label('Large tiles are 400 px; iOS rounds the corners. No letters, no brand marks.', W / 2, 840, 20, '#545A60', 400);
  parts.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${overlay}</svg>`), top: 0, left: 0 });
  for (const [i, n] of names.entries()) {
    const cx = col * i + col / 2;
    const big = await sharp(await png(n, 400)).composite([{ input: Buffer.from(`<svg width="400" height="400"><rect width="400" height="400" rx="90" fill="#fff"/></svg>`), blend: 'dest-in' }]).png().toBuffer();
    parts.push({ input: big, top: 90, left: Math.round(cx - 200) });
    const small = await sharp(await png(n, 60)).composite([{ input: Buffer.from(`<svg width="60" height="60"><rect width="60" height="60" rx="13.5" fill="#fff"/></svg>`), blend: 'dest-in' }]).png().toBuffer();
    parts.push({ input: small, top: 655, left: Math.round(cx - 200 + 65) });
    parts.push({ input: small, top: 655, left: Math.round(cx + 10 + 65) });
  }
  await sharp({ create: { width: W, height: H, channels: 3, background: '#F3F4F1' } }).composite(parts).png().toFile(path.join(ROOT, 'docs/design/icon-options.png'));
  console.log('docs/design/icon-options.png');
}

async function png2(key, size) {
  return sharp(Buffer.from(svg(CONCEPTS_2[key].draw(), size))).resize(size, size).png().toBuffer();
}

/** docs/design/icon-options-2.png: A to D, each large and at 60 px on a light and a dark wallpaper. */
async function options2() {
  const keys = Object.keys(CONCEPTS_2);
  const W = 1840;
  const H = 1000;
  const col = W / keys.length;
  const big = 340;
  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const label = (s, x, y, size, fill = '#15181B', weight = 600) => `<text x="${x}" y="${y}" font-family="DejaVu Sans, Arial" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="middle">${esc(s)}</text>`;
  const wrapNote = (t, max) => {
    const out = [];
    let line = '';
    for (const w of t.split(' ')) {
      if ((line + ' ' + w).trim().length > max) {
        out.push(line.trim());
        line = w;
      } else line += ' ' + w;
    }
    out.push(line.trim());
    return out;
  };
  let overlay = `<rect width="${W}" height="${H}" fill="#F3F4F1"/>`;
  overlay += label('Timestamp Camera: icon options, second round (A to D). Brian picks.', W / 2, 56, 30);
  keys.forEach((k, i) => {
    const cx = col * i + col / 2;
    overlay += label(`${k}. ${CONCEPTS_2[k].name}`, cx, 520, 26);
    wrapNote(CONCEPTS_2[k].note, 40).forEach((l, j) => (overlay += label(l, cx, 556 + j * 24, 17, '#545A60', 400)));
    overlay += `<rect x="${cx - 190}" y="660" width="180" height="180" rx="18" fill="#DDE3EA"/>`;
    overlay += `<rect x="${cx + 10}" y="660" width="180" height="180" rx="18" fill="#1B2430"/>`;
  });
  overlay += label('60 px on a light and a dark wallpaper under each. Large tiles are 340 px; iOS rounds the corners. No letters, no brand marks; C uses digits only.', W / 2, 920, 18, '#545A60', 400);
  const parts = [{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${overlay}</svg>`), top: 0, left: 0 }];
  const round = (size, r) => Buffer.from(`<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" fill="#fff"/></svg>`);
  for (const [i, k] of keys.entries()) {
    const cx = col * i + col / 2;
    const b = await sharp(await png2(k, big)).composite([{ input: round(big, big * 0.225), blend: 'dest-in' }]).png().toBuffer();
    parts.push({ input: b, top: 100, left: Math.round(cx - big / 2) });
    const sm = await sharp(await png2(k, 60)).composite([{ input: round(60, 13.5), blend: 'dest-in' }]).png().toBuffer();
    parts.push({ input: sm, top: 720, left: Math.round(cx - 190 + 60) });
    parts.push({ input: sm, top: 720, left: Math.round(cx + 10 + 60) });
  }
  await sharp({ create: { width: W, height: H, channels: 3, background: '#F3F4F1' } }).composite(parts).png().toFile(path.join(ROOT, 'docs/design/icon-options-2.png'));
  console.log('docs/design/icon-options-2.png');
}

async function ship(name) {
  if (!CONCEPTS[name]) throw new Error(`Pick one of: ${Object.keys(CONCEPTS).join(', ')}`);
  const flat = async (size, file) => sharp(await png(name, size)).flatten({ background: CHROME }).removeAlpha().png().toFile(path.join(ROOT, file));
  await flat(1024, 'assets/icon.png');
  await flat(48, 'assets/favicon.png');
  await flat(512, 'docs/icon-512.png');
  await flat(180, 'docs/apple-touch-icon.png');
  await sharp(Buffer.from(svg(CONCEPTS[name](false), 1024))).png().toFile(path.join(ROOT, 'assets/android-icon-foreground.png'));
  await sharp(await png(name, 400)).png().toFile(path.join(ROOT, 'assets/splash-icon.png'));
  console.log(`shipped ${name}`);
}

if (process.argv[2] === 'ship') ship(process.argv[3]).catch((e) => (console.error(e.message), process.exit(1)));
else if (process.argv[2] === 'options2') options2();
else options();
