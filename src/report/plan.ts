/**
 * How big each photo's copy in the report is, so a 30-photo report stays
 * under about 10 MB. Pure, checked by `npm test`.
 *
 * Each photo is drawn in a box of known size on the page. Its copy is made
 * at about 200 pixels per inch of that box (sharp on screen and in print),
 * never more than 1400 pixels on the long side and never larger than the
 * photo, and saved as a JPEG at quality 72. A 12 MP photo becomes about
 * 720 x 540 in the two-column grid, roughly 90 to 160 KB.
 */
export const REPORT_PPI = 200;
export const REPORT_MAX_SIDE = 1400;
export const REPORT_MIN_SIDE = 480;
export const REPORT_QUALITY = 72;
/** The budget the brief asks for: a 30-photo report under about 10 MB. */
export const REPORT_BUDGET_BYTES = 10 * 1024 * 1024;

/** The long side, in pixels, of a photo's copy for a box `w` by `h` points. */
export function reportLongSide(boxW: number, boxH: number, photoW: number, photoH: number): number {
  const want = Math.ceil((Math.max(boxW, boxH) / 72) * REPORT_PPI);
  const photoLong = Math.max(photoW, photoH);
  return Math.max(1, Math.min(photoLong, REPORT_MAX_SIDE, Math.max(REPORT_MIN_SIDE, want)));
}

/** The copy's pixel size, keeping the photo's shape. */
export function reportPixels(boxW: number, boxH: number, photoW: number, photoH: number): { width: number; height: number } {
  const long = reportLongSide(boxW, boxH, photoW, photoH);
  const k = long / Math.max(photoW, photoH, 1);
  return { width: Math.max(1, Math.round(photoW * k)), height: Math.max(1, Math.round(photoH * k)) };
}

/**
 * A cautious size estimate for a JPEG at REPORT_QUALITY: about 0.35 bytes a
 * pixel for a busy outdoor photo (gravel, leaves, siding), more than most.
 */
export function estimateJpegBytes(width: number, height: number): number {
  return Math.round(width * height * 0.35) + 2000;
}

/** The whole report: the photos' copies, the three subset fonts and the page structure. */
export function estimateReportBytes(copies: { width: number; height: number }[]): number {
  return copies.reduce((s, c) => s + estimateJpegBytes(c.width, c.height), 0) + 160_000;
}
