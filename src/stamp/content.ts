/**
 * What the stamp says: the settings, and the lines for one photo. Pure, no
 * imports besides format.ts, checked by `npm test`.
 *
 * The fallbacks are the product's promise that the shutter never waits:
 *  - no location at all (denied, or no fix yet): date and time only, plus
 *    the job and note lines if they are on. Nothing says "no location".
 *  - a fix but no address (no signal, the geocoder failed or is slow): the
 *    coordinates take the address's place, and nothing else is said.
 */
import { type Clock, type DateStyle, formatAltitude, formatCoords, formatDate, formatTime, partsOf, type Units, validCoords } from './format.ts';

export type Template = 'compact' | 'standard' | 'full';
export type Corner = 'bottomLeft' | 'bottomRight' | 'topLeft' | 'topRight';
export type StampSize = 'small' | 'medium' | 'large';

export const TEMPLATES: { id: Template; label: string; sub: string }[] = [
  { id: 'compact', label: 'Compact', sub: 'One line' },
  { id: 'standard', label: 'Standard', sub: 'Three lines' },
  { id: 'full', label: 'Full', sub: 'Every line you turned on' },
];
export const CORNERS: Corner[] = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'];
export const SIZES: { id: StampSize; label: string }[] = [
  { id: 'small', label: 'Small' },
  { id: 'medium', label: 'Medium' },
  { id: 'large', label: 'Large' },
];

/** Each line of the stamp, switchable. */
export interface StampShow {
  date: boolean;
  time: boolean;
  address: boolean;
  coords: boolean;
  altitude: boolean;
  note: boolean;
  job: boolean;
  company: boolean;
  logo: boolean;
  map: boolean;
}

export interface StampSettings {
  template: Template;
  corner: Corner;
  size: StampSize;
  show: StampShow;
  clock: Clock;
  seconds: boolean;
  dateStyle: DateStyle;
  units: Units;
  /** The free note, printed when the note line is on. */
  note: string;
}

export function defaultStamp(region: { dateStyle: DateStyle; clock: Clock; units: Units }): StampSettings {
  return {
    template: 'standard',
    corner: 'bottomLeft',
    size: 'medium',
    show: { date: true, time: true, address: true, coords: true, altitude: false, note: true, job: true, company: true, logo: true, map: false },
    clock: region.clock,
    seconds: false,
    dateStyle: region.dateStyle,
    units: region.units,
    note: '',
  };
}

/** Stored settings, cleaned: anything missing or damaged takes the default. */
export function parseStamp(json: string | null, fallback: StampSettings): StampSettings {
  let v: any;
  try {
    v = JSON.parse(json ?? 'null');
  } catch {
    return fallback;
  }
  if (!v || typeof v !== 'object') return fallback;
  const pick = <T extends string>(x: unknown, allowed: readonly T[], d: T): T => (allowed.includes(x as T) ? (x as T) : d);
  const show = { ...fallback.show };
  if (v.show && typeof v.show === 'object') for (const k of Object.keys(show) as (keyof StampShow)[]) if (typeof v.show[k] === 'boolean') show[k] = v.show[k];
  return {
    template: pick(v.template, ['compact', 'standard', 'full'] as const, fallback.template),
    corner: pick(v.corner, CORNERS, fallback.corner),
    size: pick(v.size, ['small', 'medium', 'large'] as const, fallback.size),
    show,
    clock: pick(v.clock, ['12', '24'] as const, fallback.clock),
    seconds: typeof v.seconds === 'boolean' ? v.seconds : fallback.seconds,
    dateStyle: pick(v.dateStyle, ['mdy', 'dmy', 'ymd'] as const, fallback.dateStyle),
    units: pick(v.units, ['m', 'ft'] as const, fallback.units),
    note: typeof v.note === 'string' ? v.note.slice(0, 120) : fallback.note,
  };
}

/** Where the photo was taken, as far as the phone knows. */
export interface Place {
  lat: number;
  lng: number;
  altitude: number | null;
  /** One line from the device geocoder, or null (no signal, or not back yet). */
  address: string | null;
}

/** Everything the stamp can print for one photo. */
export interface StampContext {
  /** When the photo was taken (ms). */
  time: number;
  place: Place | null;
  jobName: string;
  company: string;
  /** Pro features the stamp may use: the company name, the logo, the map. */
  pro: boolean;
  /** A logo is saved. */
  hasLogo: boolean;
}

/** The lines of text, top to bottom, and the pictures beside them. */
export interface StampContent {
  lines: string[];
  logo: boolean;
  map: boolean;
}

const SEP = '  ·  ';

/** The lines one photo's stamp prints, by template. Empty lines are dropped. */
export function stampLines(s: StampSettings, c: StampContext): StampContent {
  const p = partsOf(c.time);
  const when = [s.show.date ? formatDate(p, s.dateStyle) : '', s.show.time ? formatTime(p, s.clock, s.seconds) : ''].filter(Boolean).join('  ');
  const hasFix = c.place != null && validCoords(c.place.lat, c.place.lng);
  const coords = hasFix && s.show.coords ? formatCoords(c.place!.lat, c.place!.lng) : '';
  const altitude = hasFix && s.show.altitude ? formatAltitude(c.place!.altitude, s.units) ?? '' : '';
  const address = hasFix && s.show.address ? (c.place!.address ?? '').trim() : '';
  // No address yet (no signal): the coordinates stand in, even if their own line is off.
  const where = address || (hasFix && s.show.address ? formatCoords(c.place!.lat, c.place!.lng) : '') || coords;
  const job = s.show.job ? c.jobName.trim() : '';
  const company = s.show.company && c.pro ? c.company.trim() : '';
  const note = s.show.note ? s.note.trim() : '';
  const logo = s.show.logo && c.pro && c.hasLogo && s.template !== 'compact';
  const map = s.show.map && c.pro && hasFix && s.template === 'full';

  let lines: string[];
  if (s.template === 'compact') {
    lines = [[when, where].filter(Boolean).join(SEP)];
  } else if (s.template === 'standard') {
    lines = [when, where, [job, note].filter(Boolean).join(SEP)];
  } else {
    // Full: the coordinates get their own line unless they are already standing in for the address.
    const coordLine = [where === coords ? '' : coords, altitude].filter(Boolean).join(SEP);
    lines = [when, where, coordLine, job, company, note];
  }
  return { lines: lines.filter((l) => l.length > 0), logo, map };
}
