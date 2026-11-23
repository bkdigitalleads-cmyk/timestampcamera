/**
 * The drawing operations every report page is made of, on pages measured in
 * points with a top-left origin. Pure. pdf-lib draws them into the PDF
 * (pdf.ts) and Skia draws the same list on screen (ui/PageView.tsx), so the
 * preview is the PDF.
 */
export type FontKey = 'regular' | 'bold' | 'display';

export interface Measure {
  /** Width of the text in points at this size, as the PDF will set it. */
  width(text: string, font: FontKey, size: number): number;
  /** The text with anything the font cannot draw replaced. */
  clean(text: string, font: FontKey): string;
}

export type Op =
  | { k: 'text'; x: number; y: number; text: string; font: FontKey; size: number; color: string }
  | { k: 'rect'; x: number; y: number; w: number; h: number; fill?: string; stroke?: string; lw?: number }
  | { k: 'line'; x1: number; y1: number; x2: number; y2: number; color: string; lw: number }
  /** A picture by id: a photo's report copy, or 'logo'. */
  | { k: 'image'; id: string; x: number; y: number; w: number; h: number }
  | { k: 'path'; d: string; tx: number; ty: number; s: number; color: string };

export interface Page {
  width: number;
  height: number;
  ops: Op[];
}

export type Paper = 'letter' | 'a4';

export const PAPER_SIZE: Record<Paper, { width: number; height: number }> = {
  letter: { width: 612, height: 792 },
  a4: { width: 595.28, height: 841.89 },
};
