/**
 * How the stamp writes the date, the time, a place and a height. Pure
 * functions with no imports, checked by `npm test`. The stamp is English
 * and does not follow the phone's language, so the same photo always reads
 * the same way; the order of day and month and the clock follow the
 * person's choice (defaults come from the phone's region).
 */

export type Clock = '12' | '24';
export type DateStyle = 'mdy' | 'dmy' | 'ymd';
export type Units = 'm' | 'ft';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad2 = (n: number) => String(n).padStart(2, '0');

/** The wall clock parts of an instant, in the phone's own time zone. */
export interface Clocktime {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number; // 0-23
  minute: number;
  second: number;
}

export function partsOf(ms: number): Clocktime {
  const d = new Date(ms);
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour: d.getHours(), minute: d.getMinutes(), second: d.getSeconds() };
}

/** "Nov 22, 2026", "22 Nov 2026" or "2026-11-22". */
export function formatDate(p: Clocktime, style: DateStyle): string {
  const mon = MONTHS[Math.min(11, Math.max(0, p.month - 1))];
  if (style === 'dmy') return `${p.day} ${mon} ${p.year}`;
  if (style === 'ymd') return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
  return `${mon} ${p.day}, ${p.year}`;
}

/** "2:05 PM", "2:05:09 PM", "14:05" or "14:05:09". Midnight is 12 AM on the 12 hour clock. */
export function formatTime(p: Clocktime, clock: Clock, seconds: boolean): string {
  const s = seconds ? `:${pad2(p.second)}` : '';
  if (clock === '24') return `${pad2(p.hour)}:${pad2(p.minute)}${s}`;
  const h = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return `${h}:${pad2(p.minute)}${s} ${p.hour < 12 ? 'AM' : 'PM'}`;
}

/** True when a latitude and longitude are real numbers on the globe (0, 0 counts as no fix). */
export function validCoords(lat: number | null | undefined, lng: number | null | undefined): boolean {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  return !(lat === 0 && lng === 0);
}

/** "40.71280° N, 74.00602° W". Five decimals is about a meter. */
export function formatCoords(lat: number, lng: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(5)}° ${ns}, ${Math.abs(lng).toFixed(5)}° ${ew}`;
}

/** "Alt 12 m" or "Alt 39 ft", rounded to a whole number. Null when the phone gave no height. */
export function formatAltitude(meters: number | null | undefined, units: Units): string | null {
  if (typeof meters !== 'number' || !Number.isFinite(meters)) return null;
  const v = units === 'ft' ? meters * 3.28084 : meters;
  return `Alt ${Math.round(v)} ${units}`;
}

/**
 * One line from the parts the device geocoder returned, shortest useful
 * form: "1420 Elm St, Springfield, IL 62704". Missing parts are skipped;
 * nothing at all gives null (the stamp then prints coordinates).
 */
export function formatAddress(a: {
  streetNumber?: string | null;
  street?: string | null;
  name?: string | null;
  city?: string | null;
  subregion?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country?: string | null;
  isoCountryCode?: string | null;
} | null | undefined): string | null {
  if (!a) return null;
  const clean = (s?: string | null) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '');
  const street = [clean(a.streetNumber), clean(a.street)].filter(Boolean).join(' ');
  const first = street || clean(a.name);
  const city = clean(a.city) || clean(a.subregion);
  const region = [clean(a.region), clean(a.postalCode)].filter(Boolean).join(' ');
  const parts = [first, city, region].filter(Boolean);
  // The country only when nothing more local came back.
  if (parts.length === 0 && clean(a.country)) parts.push(clean(a.country));
  // Dedupe neighbours ("Springfield, Springfield").
  const out: string[] = [];
  for (const p of parts) if (out[out.length - 1] !== p) out.push(p);
  return out.length ? out.join(', ') : null;
}

/** The region's habits: the US and a few others write month first, use a 12 hour clock and feet. */
export function regionDefaults(region: string | null | undefined): { dateStyle: DateStyle; clock: Clock; units: Units } {
  const r = (region ?? '').toUpperCase();
  const us = r === 'US' || r === 'PR' || r === 'LR' || r === 'MM';
  const twelve = us || ['CA', 'AU', 'NZ', 'PH', 'IN', 'MX', 'EG', 'SA', 'PK', 'BD'].includes(r);
  return { dateStyle: us ? 'mdy' : r === 'CN' || r === 'JP' || r === 'KR' ? 'ymd' : 'dmy', clock: twelve ? '12' : '24', units: us || r === 'LR' || r === 'MM' ? 'ft' : 'm' };
}
