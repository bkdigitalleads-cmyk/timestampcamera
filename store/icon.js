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
else options();
