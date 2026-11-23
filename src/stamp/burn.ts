/**
 * Burns the stamp into the pixels of a photo at full resolution, offscreen,
 * with Skia. The Skia API is passed in, so the same code runs on the phone
 * (`Skia` from @shopify/react-native-skia, native Skia) and in `npm test`
 * (react-native-skia's own JS API over CanvasKit, the same Skia compiled to
 * WebAssembly). That is how tests/stamp-proof.test.mjs proves the burn on a
 * bundled 12 MP JPEG without a phone.
 *
 * Skia applies the file's EXIF orientation when it decodes, so the photo is
 * drawn upright and the stamp lands on the corner the person sees. The
 * encoded result carries no EXIF (Skia writes none): no GPS tag is left in
 * the file, the place is only what the stamp prints.
 *
 * The same drawing (drawStamp) records the live stamp over the camera
 * preview, so the preview shows the stamp where it will print.
 */
import type { SkCanvas, SkImage, SkTypeface, Skia } from '@shopify/react-native-skia';

/** The Skia API object: `Skia` on the phone, JsiSkApi(CanvasKit) in the tests. */
export type SkiaApi = typeof Skia;
import { layoutStamp } from './layout.ts';
import type { Measure, StampLayout } from './layout.ts';
import type { Corner, StampContent, StampSize } from './content.ts';

/** Skia's ImageFormat.JPEG and BlurStyle.Normal (plain numbers so Node can run this file). */
const JPEG = 3;
const BLUR_NORMAL = 0;

/** JPEG quality for the stamped photo: visually the same as the camera's file. */
export const PHOTO_QUALITY = 92;

/** Text width with Skia's own glyph advances, the same numbers that draw the text. */
export function skiaMeasure(Skia: SkiaApi, typeface: SkTypeface): Measure {
  const fonts = new Map<number, ReturnType<SkiaApi['Font']>>();
  return (text, size) => {
    const key = Math.round(size * 100);
    let f = fonts.get(key);
    if (!f) {
      f = Skia.Font(typeface, size);
      fonts.set(key, f);
    }
    if (!text) return 0;
    const ids = f.getGlyphIDs(text);
    let w = 0;
    for (const a of f.getGlyphWidths(ids)) w += a;
    return w;
  };
}

/** Decodes an encoded image (JPEG, PNG). Null when Skia cannot read it. */
export function decode(Skia: SkiaApi, bytes: Uint8Array | null | undefined): SkImage | null {
  if (!bytes || bytes.length === 0) return null;
  return Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(bytes));
}

/** The stamp's drawing, on any canvas, from a layout in that canvas's units. */
export function drawStamp(Skia: SkiaApi, canvas: SkCanvas, layout: StampLayout, typeface: SkTypeface, pictures: { logo?: SkImage | null; map?: SkImage | null } = {}): void {
  const { fontSize, shadow } = layout;
  const font = Skia.Font(typeface, fontSize);

  const shade = Skia.Paint();
  shade.setColor(Skia.Color('rgba(0, 0, 0, 0.72)'));
  shade.setMaskFilter(Skia.MaskFilter.MakeBlur(BLUR_NORMAL, Math.max(0.6, shadow * 0.6), true));
  const ink = Skia.Paint();
  ink.setColor(Skia.Color('#FFFFFF'));

  if (layout.map && pictures.map) {
    const r = layout.map;
    const rr = Skia.RRectXY(Skia.XYWHRect(r.x, r.y, r.w, r.h), fontSize * 0.25, fontSize * 0.25);
    canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(r.x + shadow, r.y + shadow, r.w, r.h), fontSize * 0.25, fontSize * 0.25), shade);
    canvas.save();
    canvas.clipRRect(rr, 1 /* intersect */, true);
    const m = pictures.map;
    canvas.drawImageRect(m, Skia.XYWHRect(0, 0, m.width(), m.height()), Skia.XYWHRect(r.x, r.y, r.w, r.h), Skia.Paint());
    canvas.restore();
    const edge = Skia.Paint();
    edge.setColor(Skia.Color('#FFFFFF'));
    edge.setStyle(1 /* stroke */);
    edge.setStrokeWidth(Math.max(1, fontSize * 0.08));
    canvas.drawRRect(rr, edge);
    // The pin: a dot in the accent with a white ring, at the spot.
    const pin = Skia.Paint();
    pin.setColor(Skia.Color('#E5482D'));
    canvas.drawCircle(r.x + r.w / 2, r.y + r.h / 2, fontSize * 0.36, ink);
    canvas.drawCircle(r.x + r.w / 2, r.y + r.h / 2, fontSize * 0.24, pin);
  }

  if (layout.logo && pictures.logo) {
    const r = layout.logo;
    const l = pictures.logo;
    canvas.drawImageRect(l, Skia.XYWHRect(0, 0, l.width(), l.height()), Skia.XYWHRect(r.x, r.y, r.w, r.h), Skia.Paint());
  }

  // A thin dark edge round every letter, then the soft shadow, then white:
  // the text reads on a white wall, a blue sky and a dark floor alike.
  const edge = Skia.Paint();
  edge.setColor(Skia.Color('rgba(0, 0, 0, 0.55)'));
  edge.setStyle(1 /* stroke */);
  edge.setStrokeWidth(Math.max(1, fontSize * 0.07));
  edge.setStrokeJoin(1 /* round */);
  for (const line of layout.lines) canvas.drawText(line.text, line.x + shadow, line.y + shadow, shade, font);
  for (const line of layout.lines) canvas.drawText(line.text, line.x, line.y, edge, font);
  for (const line of layout.lines) canvas.drawText(line.text, line.x, line.y, ink, font);
}

export interface BurnInput {
  /** The camera's JPEG (or an imported photo). */
  photo: Uint8Array;
  content: StampContent;
  corner: Corner;
  size: StampSize;
  singleLine: boolean;
  typeface: SkTypeface;
  /** PNG or JPEG bytes, when the stamp carries a logo. */
  logo?: Uint8Array | null;
  /** The map thumbnail (PNG), when the stamp carries one. */
  map?: Uint8Array | null;
  quality?: number;
}

export interface BurnResult {
  bytes: Uint8Array;
  width: number;
  height: number;
  layout: StampLayout;
}

/** Disposes a Skia object when the platform has dispose (both do; old builds may not). */
const free = (o: unknown) => {
  try {
    (o as { dispose?: () => void } | null)?.dispose?.();
  } catch {
    // already gone
  }
};

/**
 * Draws the photo at its full size on an offscreen surface, the stamp over
 * it, and encodes the result as a JPEG of the same pixel size.
 */
export function burnStamp(Skia: SkiaApi, input: BurnInput): BurnResult {
  const photo = decode(Skia, input.photo);
  if (!photo) throw new Error('The photo could not be read.');
  const width = photo.width();
  const height = photo.height();
  const logo = input.content.logo ? decode(Skia, input.logo) : null;
  const map = input.content.map ? decode(Skia, input.map) : null;

  const surface = Skia.Surface.MakeOffscreen(width, height) ?? Skia.Surface.Make(width, height);
  if (!surface) {
    free(photo);
    throw new Error('There was not enough memory to stamp this photo.');
  }
  const canvas = surface.getCanvas();
  canvas.drawImage(photo, 0, 0);

  const layout = layoutStamp({
    lines: input.content.lines,
    width,
    height,
    corner: input.corner,
    size: input.size,
    measure: skiaMeasure(Skia, input.typeface),
    logoAspect: logo ? logo.width() / Math.max(1, logo.height()) : null,
    map: map != null,
    singleLine: input.singleLine,
  });
  drawStamp(Skia, canvas, layout, input.typeface, { logo, map });
  surface.flush();

  const snapshot = surface.makeImageSnapshot();
  // A GPU snapshot is read back to the CPU before encoding.
  const cpu = snapshot.makeNonTextureImage() ?? snapshot;
  const bytes = cpu.encodeToBytes(JPEG as never, input.quality ?? PHOTO_QUALITY);
  for (const o of [cpu !== snapshot ? cpu : null, snapshot, surface, photo, logo, map]) free(o);
  if (!bytes || bytes.length === 0) throw new Error('The stamped photo could not be saved.');
  return { bytes, width, height, layout };
}

/**
 * A photo scaled so its long side is at most `maxSide` (never up), as a
 * JPEG: the report's copies and the thumbnails.
 */
export function downscaleJpeg(Skia: SkiaApi, bytes: Uint8Array, maxSide: number, quality: number): { bytes: Uint8Array; width: number; height: number } {
  const img = decode(Skia, bytes);
  if (!img) throw new Error('The photo could not be read.');
  const k = Math.min(1, maxSide / Math.max(img.width(), img.height()));
  const w = Math.max(1, Math.round(img.width() * k));
  const h = Math.max(1, Math.round(img.height() * k));
  const surface = Skia.Surface.MakeOffscreen(w, h) ?? Skia.Surface.Make(w, h);
  if (!surface) {
    free(img);
    throw new Error('There was not enough memory to resize this photo.');
  }
  const paint = Skia.Paint();
  surface.getCanvas().drawImageRectOptions(img, Skia.XYWHRect(0, 0, img.width(), img.height()), Skia.XYWHRect(0, 0, w, h), 1 /* linear */, 1 /* nearest mip */, paint);
  surface.flush();
  const snap = surface.makeImageSnapshot();
  const cpu = snap.makeNonTextureImage() ?? snap;
  const out = cpu.encodeToBytes(JPEG as never, quality);
  for (const o of [cpu !== snap ? cpu : null, snap, surface, img]) free(o);
  return { bytes: out, width: w, height: h };
}

/**
 * A before and after pair side by side on one image, each half the same
 * height, with a small label in each top corner. `height` is the output
 * height in pixels.
 */
export function composePair(Skia: SkiaApi, before: Uint8Array, after: Uint8Array, typeface: SkTypeface, height: number, quality = 90): { bytes: Uint8Array; width: number; height: number } {
  const a = decode(Skia, before);
  const b = decode(Skia, after);
  if (!a || !b) throw new Error('A photo of the pair could not be read.');
  const gap = Math.round(height * 0.012);
  const wa = Math.round((a.width() / a.height()) * height);
  const wb = Math.round((b.width() / b.height()) * height);
  const width = wa + gap + wb;
  const surface = Skia.Surface.MakeOffscreen(width, height) ?? Skia.Surface.Make(width, height);
  if (!surface) throw new Error('There was not enough memory to put the pair together.');
  const canvas = surface.getCanvas();
  canvas.clear(Skia.Color('#FFFFFF'));
  canvas.drawImageRectOptions(a, Skia.XYWHRect(0, 0, a.width(), a.height()), Skia.XYWHRect(0, 0, wa, height), 1, 1, Skia.Paint());
  canvas.drawImageRectOptions(b, Skia.XYWHRect(0, 0, b.width(), b.height()), Skia.XYWHRect(wa + gap, 0, wb, height), 1, 1, Skia.Paint());
  const size = height * 0.045;
  const font = Skia.Font(typeface, size);
  const tag = (label: string, x: number) => {
    const ids = font.getGlyphIDs(label);
    let tw = 0;
    for (const w of font.getGlyphWidths(ids)) tw += w;
    const padX = size * 0.6;
    const bg = Skia.Paint();
    bg.setColor(Skia.Color('rgba(18, 20, 22, 0.82)'));
    canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(x, size * 0.6, tw + padX * 2, size * 1.6), size * 0.3, size * 0.3), bg);
    const ink = Skia.Paint();
    ink.setColor(Skia.Color('#FFFFFF'));
    canvas.drawText(label, x + padX, size * 0.6 + size * 1.17, ink, font);
  };
  tag('BEFORE', size * 0.6);
  tag('AFTER', wa + gap + size * 0.6);
  surface.flush();
  const snap = surface.makeImageSnapshot();
  const cpu = snap.makeNonTextureImage() ?? snap;
  const bytes = cpu.encodeToBytes(JPEG as never, quality);
  for (const o of [cpu !== snap ? cpu : null, snap, surface, a, b]) free(o);
  return { bytes, width, height };
}
