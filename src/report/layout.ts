/**
 * The photo report, laid out as drawing operations on pages (pdf/ops.ts).
 * Pure, checked by `npm test`. pdf-lib writes it (pdf/pdf.ts) and Skia draws
 * the same pages for the preview (ui/PageView.tsx).
 *
 * Order: a cover block (the company and logo, "Photo report", the job, the
 * client, the dates and counts, the job's notes), then the photos in a
 * two-column grid by day with their captions, then the before and after
 * pairs side by side, then the punch list with each item's status, then
 * the client's sign-off when one was signed. Every page ends with the job
 * and "Page 2 of 5".
 *
 * The photos carry their stamps already (burned in); the captions under
 * them are the report's own: the time, the caption or note, and "Imported"
 * for a photo that came from the library.
 */
import type { FontKey, Measure, Op, Page, Paper } from '../pdf/ops.ts';
import { PAPER_SIZE } from '../pdf/ops.ts';
import type { Job, Photo, PunchItem } from '../model.ts';
import { dateRange, dayKey, longDay, pairsOf, photosByDay, shortDate } from '../jobs.ts';
import type { Pair } from '../jobs.ts';
import { ordered, punchSummary } from '../punch.ts';
import { formatCoords, formatTime, partsOf } from '../stamp/format.ts';
import type { Clock } from '../stamp/format.ts';
import { strokePath, strokesBounds } from '../stroke.ts';
import type { Stroke } from '../stroke.ts';

export const INK = '#15181B';
export const SOFT = '#545A60';
export const FAINT = '#868C92';
export const RULE = '#D9DCD6';
export const ACCENT = '#FFC61A';
export const GOOD = '#1E6F46';
export const WELL = '#EEF0EC';

export interface ReportOptions {
  photos: boolean;
  pairs: boolean;
  punch: boolean;
  signature: boolean;
  /** Days to include ("2026-11-22"); null for every day. */
  days: string[] | null;
}

export interface Signoff {
  strokes: Stroke[];
  name: string;
  at: number;
}

export interface ReportInput {
  company: string;
  /** The logo's pixel size; its bytes go to the writer under the id 'logo'. */
  logo: { width: number; height: number } | null;
  job: Job;
  photos: Photo[];
  items: PunchItem[];
  signoff: Signoff | null;
  options: ReportOptions;
  paper: Paper;
  clock: Clock;
  /** When the report is made. */
  now: number;
}

export interface PlacedImage {
  id: string;
  /** The largest box the photo is drawn in, in points. */
  w: number;
  h: number;
}

export interface Report {
  pages: Page[];
  /** Every photo drawn, with the box it needs, for making its downscaled copy. */
  images: PlacedImage[];
  photoCount: number;
  pairCount: number;
}

/** Splits text into lines no wider than max, at spaces, keeping line breaks; very long words are cut. (Engine copy.) */
export function wrap(m: Measure, text: string, font: FontKey, size: number, max: number): string[] {
  const out: string[] = [];
  for (const para of m.clean(text, font).split(/\r?\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      out.push('');
      continue;
    }
    let line = '';
    for (let word of words) {
      while (m.width(word, font, size) > max && word.length > 1) {
        let cut = word.length - 1;
        while (cut > 1 && m.width(word.slice(0, cut), font, size) > max) cut--;
        if (line) {
          out.push(line);
          line = '';
        }
        out.push(word.slice(0, cut));
        word = word.slice(cut);
      }
      const next = line ? `${line} ${word}` : word;
      if (m.width(next, font, size) <= max) line = next;
      else {
        out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  while (out.length > 1 && out[out.length - 1] === '') out.pop();
  return out;
}

/** Shortens one line with "..." to fit. */
export function fit(m: Measure, text: string, font: FontKey, size: number, max: number): string {
  const t = m.clean(text, font);
  if (m.width(t, font, size) <= max) return t;
  let s = t;
  while (s.length > 1 && m.width(`${s}...`, font, size) > max) s = s.slice(0, -1);
  return `${s.trimEnd()}...`;
}

/** A picture fitted inside a box, centred (contain). */
export function contain(box: { x: number; y: number; w: number; h: number }, pw: number, ph: number, align: 'center' | 'left' = 'center'): { x: number; y: number; w: number; h: number } {
  const k = Math.min(box.w / Math.max(1, pw), box.h / Math.max(1, ph));
  const w = pw * k;
  const h = ph * k;
  return { x: align === 'left' ? box.x : box.x + (box.w - w) / 2, y: align === 'left' ? box.y : box.y + (box.h - h) / 2, w, h };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The lines under a photo in the grid: its caption (or the stamp's note), then
 * where it was taken as the stamp printed it, the address, or the coordinates
 * when the stamp printed coordinates. A photo with no place gets no place line.
 */
export function captionBody(m: Measure, p: Pick<Photo, 'caption' | 'note' | 'address' | 'lat' | 'lng'>, width: number): string[] {
  const text = (p.caption.trim() || p.note.trim()).trim();
  const place = (p.address ?? '').trim() || (p.lat != null && p.lng != null ? formatCoords(p.lat, p.lng) : '');
  const out: string[] = [];
  if (text) out.push(fit(m, text, 'regular', 8.5, width));
  if (place) out.push(fit(m, place, 'regular', 8.5, width));
  return out;
}

/** What goes in: the chosen days, the pairs with both halves, and the grid without the paired photos. */
export function reportContent(photos: Photo[], options: ReportOptions): { grid: Photo[]; pairs: Pair[] } {
  const chosen = options.days ? photos.filter((p) => options.days!.includes(dayKey(p.takenAt))) : photos;
  const pairs = options.pairs ? pairsOf(chosen).filter((p) => p.after != null && chosen.includes(p.after)) : [];
  const paired = new Set(pairs.flatMap((p) => [p.before.id, p.after!.id]));
  const grid = options.photos ? chosen.filter((p) => !paired.has(p.id)) : [];
  return { grid, pairs };
}

export function layoutReport(m: Measure, input: ReportInput): Report {
  const { width: W, height: H } = PAPER_SIZE[input.paper];
  const M = 40;
  const CW = W - 2 * M;
  const BOTTOM = H - 52;
  const GUT = 14;
  const COL = (CW - GUT) / 2;
  /** A portrait photo's box is at most square, so two rows fit on a page. */
  const PORTRAIT = 1;
  const pages: Page[] = [];
  const images = new Map<string, PlacedImage>();
  let ops: Op[] = [];
  let y = M;

  const text = (x: number, yy: number, t: string, font: FontKey, size: number, color = INK) => {
    if (t) ops.push({ k: 'text', x, y: yy, text: m.clean(t, font), font, size, color });
  };
  const hline = (x1: number, x2: number, yy: number, color = RULE, lw = 0.6) => ops.push({ k: 'line', x1, y1: yy, x2, y2: yy, color, lw });
  const newPage = () => {
    ops = [];
    pages.push({ width: W, height: H, ops });
    ops.push({ k: 'rect', x: 0, y: 0, w: W, h: 5, fill: ACCENT });
    y = M;
  };
  const continued = () => {
    newPage();
    text(M, y + 9, fit(m, `${input.job.name.trim() || 'Photo report'}, continued`, 'bold', 9, CW), 'bold', 9, SOFT);
    y += 24;
  };
  const ensure = (h: number) => {
    if (y + h > BOTTOM) continued();
  };
  const place = (id: string, box: { x: number; y: number; w: number; h: number }, pw: number, ph: number, align: 'center' | 'left' = 'center') => {
    const r = contain(box, pw, ph, align);
    ops.push({ k: 'image', id, ...r });
    const cur = images.get(id);
    if (!cur || r.w * r.h > cur.w * cur.h) images.set(id, { id, w: r.w, h: r.h });
  };
  const when = (ms: number) => formatTime(partsOf(ms), input.clock, false);
  /** A section heading, kept on the same page as `next` points of what follows it. */
  const section = (title: string, sub: string, next: number) => {
    ensure(48 + next);
    y += 10;
    text(M, y + 18, title, 'display', 20);
    if (sub) text(M + m.width(title, 'display', 20) + 10, y + 18, sub, 'regular', 10, SOFT);
    y += 26;
    hline(M, M + CW, y, INK, 1);
    y += 12;
  };

  const { grid, pairs } = reportContent(input.photos, input.options);
  const chosen = input.options.days ? input.photos.filter((p) => input.options.days!.includes(dayKey(p.takenAt))) : input.photos;
  const items = input.options.punch ? ordered(input.items) : [];

  // ---- cover block ----
  newPage();
  let logoBottom = y;
  if (input.logo) {
    const box = { x: M + CW - 120, y, w: 120, h: 56 };
    const r = contain(box, input.logo.width, input.logo.height);
    ops.push({ k: 'image', id: 'logo', x: box.x + box.w - r.w, y: box.y, w: r.w, h: r.h });
    logoBottom = y + r.h;
  }
  const leftW = CW - (input.logo ? 136 : 0);
  if (input.company.trim()) {
    text(M, y + 12, fit(m, input.company.trim().toUpperCase(), 'display', 13, leftW), 'display', 13, SOFT);
    y += 18;
  }
  text(M, y + 30, 'Photo report', 'display', 34);
  y += 42;
  for (const l of wrap(m, input.job.name.trim() || 'Untitled job', 'bold', 16, leftW).slice(0, 2)) {
    text(M, y + 16, l, 'bold', 16);
    y += 21;
  }
  const facts: [string, string][] = [];
  if (input.job.address.trim()) facts.push(['Address', input.job.address.trim()]);
  if (input.job.client.trim()) facts.push(['Client', input.job.client.trim()]);
  const range = dateRange(chosen);
  if (range) facts.push(['Dates', range]);
  const counts = [plural(grid.length + pairs.length * 2, 'photo', 'photos')];
  if (pairs.length) counts.push(plural(pairs.length, 'before and after pair', 'before and after pairs'));
  if (items.length) counts.push(plural(items.length, 'punch list item', 'punch list items'));
  facts.push(['In this report', counts.join(', ')]);
  facts.push(['Prepared', shortDate(input.now)]);
  y += 6;
  for (const [k, v] of facts) {
    text(M, y + 10, k, 'regular', 9.5, SOFT);
    const lines = wrap(m, v, 'regular', 10, leftW - 92).slice(0, 2);
    lines.forEach((l, i) => text(M + 92, y + 10 + i * 13, l, 'regular', 10));
    y += 13 * lines.length + 3;
  }
  if (input.job.notes.trim()) {
    y += 6;
    text(M, y + 10, 'Notes', 'regular', 9.5, SOFT);
    const lines = wrap(m, input.job.notes.trim(), 'regular', 10, leftW - 92).slice(0, 6);
    lines.forEach((l, i) => text(M + 92, y + 10 + i * 13, l, 'regular', 10));
    y += 13 * lines.length + 3;
  }
  y = Math.max(y, logoBottom) + 14;
  hline(M, M + CW, y, INK, 1.5);
  y += 16;

  // ---- photos by day ----
  if (grid.length) {
    for (const day of photosByDay(grid).reverse()) {
      // The day's heading stays with its first row of photos.
      const first = day.photos.slice(0, 2);
      ensure(20 + Math.max(...first.map((p) => Math.min(COL * (p.height / Math.max(1, p.width)), COL * PORTRAIT))) + 48);
      text(M, y + 11, longDay(day.photos[0].takenAt), 'bold', 11);
      text(M + m.width(longDay(day.photos[0].takenAt), 'bold', 11) + 8, y + 11, plural(day.photos.length, 'photo', 'photos'), 'regular', 9.5, SOFT);
      y += 20;
      for (let i = 0; i < day.photos.length; i += 2) {
        const row = day.photos.slice(i, i + 2);
        const boxes = row.map((p) => Math.min(COL * (p.height / Math.max(1, p.width)), COL * PORTRAIT));
        const boxH = Math.max(...boxes);
        const caps = row.map((p) => {
          // An imported photo's time is the file's own, already on its stamp (or absent): the caption says Imported instead.
          // No Before or After here: a photo in the grid is not in a pair in this report (pairs have their own section),
          // and a Before with no After is simply a photo.
          const head = p.imported ? 'Imported' : when(p.takenAt);
          return { head, body: captionBody(m, p, COL) };
        });
        const capH = 14 + Math.max(...caps.map((c) => c.body.length)) * 11;
        ensure(boxH + capH + 12);
        row.forEach((p, j) => {
          const x = M + j * (COL + GUT);
          place(p.id, { x, y, w: COL, h: boxH }, p.width, p.height, 'left');
          text(x, y + boxH + 12, caps[j].head, 'bold', 8.5);
          caps[j].body.forEach((l, k) => text(x, y + boxH + 23 + k * 11, l, 'regular', 8.5, SOFT));
        });
        y += boxH + capH + 12;
      }
      y += 4;
    }
  }

  // ---- before and after ----
  if (pairs.length) {
    const firstPair = pairs[0].before;
    section('Before and after', plural(pairs.length, 'pair', 'pairs'), 40 + Math.min(COL * (firstPair.height / Math.max(1, firstPair.width)), COL * PORTRAIT));
    for (const pair of pairs) {
      const a = pair.before;
      const b = pair.after!;
      const boxH = Math.min(COL * (a.height / Math.max(1, a.width)), COL * PORTRAIT);
      const label = (pair.after?.caption || a.caption || a.note || '').trim();
      ensure(boxH + 44 + (label ? 12 : 0));
      const head = (x: number, tag: string, p: Photo) => {
        ops.push({ k: 'rect', x, y, w: m.width(tag, 'display', 10) + 10, h: 14, fill: INK });
        text(x + 5, y + 10.5, tag, 'display', 10, '#FFFFFF');
        text(x + m.width(tag, 'display', 10) + 16, y + 10.5, `${shortDate(p.takenAt)}, ${when(p.takenAt)}`, 'regular', 8.5, SOFT);
      };
      head(M, 'BEFORE', a);
      head(M + COL + GUT, 'AFTER', b);
      y += 20;
      ops.push({ k: 'rect', x: M, y, w: COL, h: boxH, fill: WELL });
      ops.push({ k: 'rect', x: M + COL + GUT, y, w: COL, h: boxH, fill: WELL });
      place(a.id, { x: M, y, w: COL, h: boxH }, a.width, a.height);
      place(b.id, { x: M + COL + GUT, y, w: COL, h: boxH }, b.width, b.height);
      y += boxH + 8;
      if (label) {
        text(M, y + 9, fit(m, label, 'regular', 9, CW), 'regular', 9, SOFT);
        y += 12;
      }
      y += 12;
    }
  }

  // ---- punch list ----
  if (items.length) {
    section('Punch list', punchSummary(items), 40);
    const counts = new Map<string, number>();
    for (const p of input.photos) if (p.itemId) counts.set(p.itemId, (counts.get(p.itemId) ?? 0) + 1);
    const RIGHT = 96;
    for (const it of items) {
      const title = wrap(m, it.title, 'bold', 10.5, CW - 22 - RIGHT).slice(0, 3);
      const note = it.note.trim() ? wrap(m, it.note.trim(), 'regular', 9, CW - 22 - RIGHT).slice(0, 4) : [];
      const h = Math.max(30, 8 + title.length * 13 + note.length * 11.5 + 8);
      ensure(h);
      const done = it.status === 'done';
      ops.push({ k: 'rect', x: M, y: y + 6, w: 12, h: 12, fill: done ? GOOD : undefined, stroke: done ? GOOD : INK, lw: 1 });
      if (done) {
        ops.push({ k: 'line', x1: M + 2.6, y1: y + 12.2, x2: M + 5.2, y2: y + 14.8, color: '#FFFFFF', lw: 1.6 });
        ops.push({ k: 'line', x1: M + 5.2, y1: y + 14.8, x2: M + 9.6, y2: y + 8.8, color: '#FFFFFF', lw: 1.6 });
      }
      title.forEach((l, i) => text(M + 22, y + 16 + i * 13, l, 'bold', 10.5));
      note.forEach((l, i) => text(M + 22, y + 16 + title.length * 13 + i * 11.5, l, 'regular', 9, SOFT));
      const status = done ? `Done ${it.doneAt ? shortDate(it.doneAt).replace(/, \d{4}$/, '') : ''}`.trim() : 'Open';
      text(M + CW - m.width(status, 'bold', 9.5), y + 16, status, 'bold', 9.5, done ? GOOD : INK);
      const n = counts.get(it.id) ?? 0;
      if (n) {
        const s = plural(n, 'photo', 'photos');
        text(M + CW - m.width(s, 'regular', 8.5), y + 28, s, 'regular', 8.5, FAINT);
      }
      y += h;
      hline(M, M + CW, y);
    }
    y += 10;
  }

  // ---- sign-off ----
  const so = input.options.signature ? input.signoff : null;
  if (so && so.strokes.length) {
    section('Sign-off', '', 96);
    const boxW = CW / 2;
    const lineY = y + 58;
    const b = strokesBounds(so.strokes);
    if (b) {
      const s = Math.min((boxW - 12) / Math.max(1, b.width), 50 / Math.max(1, b.height));
      const tx = M + 4 - b.x * s;
      const ty = lineY + 2 - (b.y + b.height) * s;
      for (const st of so.strokes) ops.push({ k: 'path', d: strokePath(st), tx, ty, s, color: '#1A1A1E' });
    }
    hline(M, M + boxW, lineY, INK, 0.8);
    text(M, lineY + 13, fit(m, so.name.trim() ? `${so.name.trim()}, client` : 'Client signature', 'regular', 9, boxW), 'regular', 9, SOFT);
    text(M, lineY + 25, `Signed ${shortDate(so.at)}, ${when(so.at)}`, 'regular', 9, FAINT);
    y = lineY + 34;
  }

  // ---- footers ----
  const foot = [input.job.name.trim() || 'Untitled job', input.job.client.trim()].filter(Boolean).join(', ');
  pages.forEach((p, i) => {
    const pg = `Page ${i + 1} of ${pages.length}`;
    p.ops.push({ k: 'line', x1: M, y1: H - 34, x2: M + CW, y2: H - 34, color: RULE, lw: 0.6 });
    p.ops.push({ k: 'text', x: M, y: H - 22, text: fit(m, foot, 'regular', 8, CW - 90), font: 'regular', size: 8, color: FAINT });
    p.ops.push({ k: 'text', x: M + CW - m.width(pg, 'regular', 8), y: H - 22, text: pg, font: 'regular', size: 8, color: FAINT });
  });

  return { pages, images: [...images.values()], photoCount: grid.length + pairs.length * 2, pairCount: pairs.length };
}
