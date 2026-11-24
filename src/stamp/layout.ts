/**
 * Where the stamp sits on a photo, in the photo's own pixels. Pure (text
 * widths come from a measure function), checked by `npm test`. The same
 * layout draws the live stamp over the camera preview (scaled to the
 * preview) and burns it into the saved photo at full size, so the stamp
 * prints where the preview showed it.
 *
 * Sizes follow the photo's short side, so a stamp covers the same share of
 * a 12 MP photo and of the preview. Text runs toward the corner's edge
 * (left aligned in left corners, right aligned in right corners), with the
 * logo and the map on the outside, next to the edge.
 */
import type { Corner, StampSize } from './content.ts';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LaidLine {
  text: string;
  /** Left edge of the text. */
  x: number;
  /** Baseline. */
  y: number;
  width: number;
}

export interface StampLayout {
  fontSize: number;
  lineHeight: number;
  /** Offset of the thin shadow under the text. */
  shadow: number;
  lines: LaidLine[];
  logo: Rect | null;
  map: Rect | null;
  /** Everything the stamp covers, for the before/after overlay and the proof check. */
  box: Rect;
  align: 'left' | 'right';
}

/**
 * The length the stamp's size is a share of. For a camera photo (3:4) and a
 * square it is the short side, so the stamp covers the same share of a 12 MP
 * photo and of the preview. A long thin picture, such as a 9:19.5 screenshot
 * imported from the library, is shown in a box closer to 3:4 in the photo
 * screen, the grid and the report, which shrinks it; sized on its short side
 * alone its stamp looked a third smaller than on camera photos (Brian's test
 * of build 3). So the base is the larger of the short side and three quarters
 * of the long side, never more than 1.6 times the short side, so the stamp
 * still fits across a narrow picture and stays sane on a panorama.
 */
export function stampBase(width: number, height: number): number {
  const short = Math.min(width, height);
  const long = Math.max(width, height);
  return Math.min(Math.max(short, long * 0.75), short * 1.6);
}

/** Font size as a share of the stamp base (stampBase). */
export const SIZE_SHARE: Record<StampSize, number> = { small: 0.026, medium: 0.034, large: 0.045 };

/** Barlow's ascent and descent as a share of the font size, for baselines. */
const ASCENT = 0.86;
const LINE = 1.24;

export type Measure = (text: string, fontSize: number) => number;

/** Cuts text to fit `max`, ending with "…". */
export function fitText(text: string, max: number, fontSize: number, measure: Measure): string {
  if (measure(text, fontSize) <= max) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(text.slice(0, mid).trimEnd() + '…', fontSize) <= max) lo = mid;
    else hi = mid - 1;
  }
  return lo === 0 ? '' : text.slice(0, lo).trimEnd() + '…';
}

/** Breaks a line at spaces into at most `maxLines`, the last one cut to fit. */
export function wrapText(text: string, max: number, fontSize: number, measure: Measure, maxLines: number): string[] {
  if (maxLines <= 1 || measure(text, fontSize) <= max) return [fitText(text, max, fontSize, measure)];
  const words = text.split(' ');
  const out: string[] = [];
  let cur = '';
  let i = 0;
  for (; i < words.length; i++) {
    const next = cur ? `${cur} ${words[i]}` : words[i];
    if (measure(next, fontSize) <= max || !cur) {
      cur = next;
      continue;
    }
    out.push(cur);
    cur = words[i];
    if (out.length === maxLines - 1) {
      cur = words.slice(i).join(' ');
      i = words.length;
      break;
    }
  }
  out.push(cur);
  return out.map((l) => fitText(l, max, fontSize, measure));
}

export function layoutStamp(opts: {
  lines: string[];
  width: number;
  height: number;
  corner: Corner;
  size: StampSize;
  measure: Measure;
  /** Width over height of the logo, when the stamp carries one. */
  logoAspect?: number | null;
  map?: boolean;
  /** One line only (Compact): long text is cut, never wrapped. */
  singleLine?: boolean;
}): StampLayout {
  const { width, height, corner, measure } = opts;
  const short = Math.min(width, height);
  const fontSize = Math.max(6, stampBase(width, height) * SIZE_SHARE[opts.size]);
  const lineHeight = fontSize * LINE;
  const margin = short * 0.035;
  const gap = fontSize * 0.5;
  const shadow = Math.max(1, fontSize * 0.055);
  const left = corner === 'topLeft' || corner === 'bottomLeft';
  const top = corner === 'topLeft' || corner === 'topRight';

  const mapSize = opts.map ? fontSize * 4.6 : 0;
  const logoBox = opts.logoAspect && opts.logoAspect > 0 ? fontSize * 2.6 : 0;
  const logoW = logoBox ? (opts.logoAspect! >= 1 ? logoBox : logoBox * opts.logoAspect!) : 0;
  const logoH = logoBox ? (opts.logoAspect! >= 1 ? logoBox / opts.logoAspect! : logoBox) : 0;
  const side = (mapSize ? mapSize + gap : 0) + (logoW ? logoW + gap : 0);
  const maxText = Math.max(fontSize * 4, width - 2 * margin - side);

  const texts: string[] = [];
  for (const l of opts.lines) for (const piece of wrapText(l, maxText, fontSize, measure, opts.singleLine ? 1 : 2)) if (piece) texts.push(piece);
  const widths = texts.map((t) => measure(t, fontSize));
  const textW = widths.reduce((m, w) => Math.max(m, w), 0);
  const textH = texts.length ? (texts.length - 1) * lineHeight + fontSize * 1.1 : 0;
  const blockH = Math.max(textH, logoH, mapSize);
  const blockW = textW + side;

  const blockX = left ? margin : width - margin - blockW;
  const blockY = top ? margin : height - margin - blockH;
  // Everything sits on the outer edge (bottom for bottom corners, top for top corners).
  const vAlign = (h: number) => (top ? blockY : blockY + blockH - h);

  let cursor = left ? blockX : blockX + blockW;
  const take = (w: number) => {
    const x = left ? cursor : cursor - w;
    cursor = left ? cursor + w + gap : cursor - w - gap;
    return x;
  };
  const map = mapSize ? { x: take(mapSize), y: vAlign(mapSize), w: mapSize, h: mapSize } : null;
  const logo = logoW ? { x: take(logoW), y: vAlign(logoH), w: logoW, h: logoH } : null;
  const textTop = vAlign(textH);
  const lines: LaidLine[] = texts.map((text, i) => ({
    text,
    width: widths[i],
    x: left ? cursor : cursor - widths[i],
    y: textTop + i * lineHeight + fontSize * ASCENT,
  }));

  return {
    fontSize,
    lineHeight,
    shadow,
    lines,
    logo,
    map,
    box: { x: blockX, y: blockY, w: blockW, h: blockH },
    align: left ? 'left' : 'right',
  };
}

/** Scales a layout made for one size to another (the preview to the photo, or back). */
export function scaleRect(r: Rect, k: number): Rect {
  return { x: r.x * k, y: r.y * k, w: r.w * k, h: r.h * k };
}
