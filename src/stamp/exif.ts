/**
 * Reads what a JPEG says about itself: its pixel size (from the frame
 * header) and, from EXIF, its orientation, capture time and GPS position.
 * Pure, no imports, checked by `npm test`. Used when a photo is imported
 * from the library (its own date and place go on the stamp when the file
 * has them) and by the stamp proof to read the size of the output.
 */

export interface JpegInfo {
  /** Stored size, before orientation. */
  width: number;
  height: number;
  /** EXIF orientation 1-8 (1 when absent). */
  orientation: number;
  /** "2026:10:04 15:42:07" read as local wall time, in ms; null when absent. */
  takenAt: number | null;
  lat: number | null;
  lng: number | null;
  altitude: number | null;
}

/** Width and height as the photo is seen (orientations 5 to 8 swap them). */
export function uprightSize(info: Pick<JpegInfo, 'width' | 'height' | 'orientation'>): { width: number; height: number } {
  return info.orientation >= 5 && info.orientation <= 8 ? { width: info.height, height: info.width } : { width: info.width, height: info.height };
}

/** "2026:10:04 15:42:07" as local wall time in ms, or null. */
export function parseExifDate(s: string | null | undefined): number | null {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec((s ?? '').trim());
  if (!m) return null;
  const [y, mo, d, h, mi, se] = m.slice(1).map(Number);
  if (y < 1990 || mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || se > 60) return null;
  const t = new Date(y, mo - 1, d, h, mi, se).getTime();
  return Number.isFinite(t) ? t : null;
}

export function readJpeg(bytes: Uint8Array): JpegInfo | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const info: JpegInfo = { width: 0, height: 0, orientation: 1, takenAt: null, lat: null, lng: null, altitude: null };
  let i = 2;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) return info.width ? info : null;
    const marker = bytes[i + 1];
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01 || marker === 0xff) {
      i += marker === 0xff ? 1 : 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) break;
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    if (len < 2 || i + 2 + len > bytes.length) break;
    const start = i + 4;
    // SOF0-SOF15 except DHT (C4), JPG (C8) and DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      info.height = (bytes[start + 1] << 8) | bytes[start + 2];
      info.width = (bytes[start + 3] << 8) | bytes[start + 4];
    } else if (marker === 0xe1 && len > 8 && bytes[start] === 0x45 && bytes[start + 1] === 0x78 && bytes[start + 2] === 0x69 && bytes[start + 3] === 0x66) {
      try {
        readExif(bytes.subarray(start + 6, i + 2 + len), info);
      } catch {
        // damaged EXIF: keep what was read
      }
    }
    i += 2 + len;
  }
  return info.width > 0 && info.height > 0 ? info : null;
}

function readExif(t: Uint8Array, info: JpegInfo): void {
  const le = t[0] === 0x49 && t[1] === 0x49;
  if (!le && !(t[0] === 0x4d && t[1] === 0x4d)) return;
  const u16 = (o: number) => (o + 2 > t.length ? 0 : le ? t[o] | (t[o + 1] << 8) : (t[o] << 8) | t[o + 1]);
  const u32 = (o: number) => (o + 4 > t.length ? 0 : le ? (t[o] | (t[o + 1] << 8) | (t[o + 2] << 16)) + t[o + 3] * 0x1000000 : t[o] * 0x1000000 + ((t[o + 1] << 16) | (t[o + 2] << 8) | t[o + 3]));
  const ascii = (o: number, n: number) => {
    let s = '';
    for (let k = 0; k < n && o + k < t.length && t[o + k] !== 0; k++) s += String.fromCharCode(t[o + k]);
    return s;
  };
  type Entry = { tag: number; type: number; count: number; at: number };
  const entries = (ifd: number): Entry[] => {
    const out: Entry[] = [];
    if (ifd <= 0 || ifd + 2 > t.length) return out;
    const n = Math.min(u16(ifd), 200);
    for (let k = 0; k < n; k++) {
      const e = ifd + 2 + k * 12;
      if (e + 12 > t.length) break;
      const type = u16(e + 2);
      const count = u32(e + 4);
      const size = ([0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8][type] ?? 1) * count;
      out.push({ tag: u16(e), type, count, at: size <= 4 ? e + 8 : u32(e + 8) });
    }
    return out;
  };
  const rational = (o: number) => {
    const d = u32(o + 4);
    return d === 0 ? NaN : u32(o) / d;
  };
  const dms = (en: Entry) => rational(en.at) + rational(en.at + 8) / 60 + rational(en.at + 16) / 3600;

  const ifd0 = entries(u32(4));
  let exifIfd = 0;
  let gpsIfd = 0;
  let date0: string | null = null;
  for (const en of ifd0) {
    if (en.tag === 0x0112) info.orientation = u16(en.at) || 1;
    else if (en.tag === 0x8769) exifIfd = u32(en.at);
    else if (en.tag === 0x8825) gpsIfd = u32(en.at);
    else if (en.tag === 0x0132) date0 = ascii(en.at, en.count);
  }
  let original: string | null = null;
  for (const en of entries(exifIfd)) if (en.tag === 0x9003) original = ascii(en.at, en.count);
  info.takenAt = parseExifDate(original) ?? parseExifDate(date0);

  let latRef = 'N';
  let lngRef = 'E';
  let lat = NaN;
  let lng = NaN;
  let alt = NaN;
  let altBelow = false;
  for (const en of entries(gpsIfd)) {
    if (en.tag === 1) latRef = ascii(en.at, 2);
    else if (en.tag === 2 && en.count >= 3) lat = dms(en);
    else if (en.tag === 3) lngRef = ascii(en.at, 2);
    else if (en.tag === 4 && en.count >= 3) lng = dms(en);
    else if (en.tag === 5) altBelow = t[en.at] === 1;
    else if (en.tag === 6) alt = rational(en.at);
  }
  if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0)) {
    info.lat = latRef.toUpperCase().startsWith('S') ? -lat : lat;
    info.lng = lngRef.toUpperCase().startsWith('W') ? -lng : lng;
    info.altitude = Number.isFinite(alt) ? (altBelow ? -alt : alt) : null;
  }
}
