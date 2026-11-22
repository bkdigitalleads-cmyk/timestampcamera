/**
 * A job's photos as the screens and the report show them: by day, the
 * before and after pairs, the date range. Pure, checked by `npm test`.
 */
import type { Job, Photo } from './model.ts';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** The local calendar day, "2026-11-22". */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

/** "Today", "Yesterday", or "Saturday, Nov 22" (with the year when it is not this year). */
export function dayLabel(key: string, now: number): string {
  if (key === dayKey(now)) return 'Today';
  if (key === dayKey(now - 86400000)) return 'Yesterday';
  const d = fromKey(key);
  const year = d.getFullYear() !== new Date(now).getFullYear() ? `, ${d.getFullYear()}` : '';
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}${year}`;
}

/** "Saturday, Nov 22, 2026" for the report. */
export function longDay(ms: number): string {
  const d = new Date(ms);
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export function shortDate(ms: number): string {
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export interface Day {
  key: string;
  photos: Photo[];
}

/** Days newest first; inside a day, in the order the photos were taken. */
export function photosByDay(photos: Photo[]): Day[] {
  const map = new Map<string, Photo[]>();
  for (const p of [...photos].sort((a, b) => a.takenAt - b.takenAt || a.createdAt - b.createdAt)) {
    const k = dayKey(p.takenAt);
    const list = map.get(k);
    if (list) list.push(p);
    else map.set(k, [p]);
  }
  return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([key, list]) => ({ key, photos: list }));
}

/** "Nov 22, 2026", "Nov 18 to 22, 2026", "Nov 28 to Dec 3, 2026" or "Dec 30, 2026 to Jan 2, 2027". Null with no photos. */
export function dateRange(photos: Pick<Photo, 'takenAt'>[]): string | null {
  if (photos.length === 0) return null;
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of photos) {
    lo = Math.min(lo, p.takenAt);
    hi = Math.max(hi, p.takenAt);
  }
  const a = new Date(lo);
  const b = new Date(hi);
  if (dayKey(lo) === dayKey(hi)) return shortDate(lo);
  if (a.getFullYear() !== b.getFullYear()) return `${shortDate(lo)} to ${shortDate(hi)}`;
  if (a.getMonth() === b.getMonth()) return `${MONTHS[a.getMonth()]} ${a.getDate()} to ${b.getDate()}, ${b.getFullYear()}`;
  return `${MONTHS[a.getMonth()]} ${a.getDate()} to ${MONTHS[b.getMonth()]} ${b.getDate()}, ${b.getFullYear()}`;
}

export interface Pair {
  before: Photo;
  after: Photo | null;
}

/** Every Before with its After (the newest one taken for it), in the order the Befores were taken. */
export function pairsOf(photos: Photo[]): Pair[] {
  const afters = new Map<string, Photo>();
  for (const p of photos) {
    if (p.role !== 'after' || !p.pairId) continue;
    const cur = afters.get(p.pairId);
    if (!cur || p.takenAt > cur.takenAt) afters.set(p.pairId, p);
  }
  return photos
    .filter((p) => p.role === 'before')
    .sort((a, b) => a.takenAt - b.takenAt)
    .map((before) => ({ before, after: afters.get(before.id) ?? null }));
}

/** "Job 1", "Job 2": the first free number among the jobs that exist. */
export function nextJobName(jobs: Pick<Job, 'name'>[]): string {
  const taken = new Set(jobs.map((j) => j.name.trim().toLowerCase()));
  let n = 1;
  while (taken.has(`job ${n}`)) n++;
  return `Job ${n}`;
}

/** "12 photos", "1 photo", "No photos yet". */
export function photoCount(n: number): string {
  return n === 0 ? 'No photos yet' : n === 1 ? '1 photo' : `${n} photos`;
}
