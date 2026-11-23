/**
 * Writing the PDF with pdf-lib: the layout's operations, drawn one to one.
 * Pure (no native imports), so `npm test` makes real PDFs and checks them.
 * Engine copy from Estimate Maker; images are now many (one per photo,
 * JPEG, plus the logo as PNG or JPEG) and looked up by id.
 */
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { FontKey, Page } from './ops.ts';
import { FEATURES } from './fonts.ts';
import type { FontBytes } from './fonts.ts';

function color(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

export interface PdfMeta {
  title: string;
  author: string;
  subject: string;
}

const isPng = (b: Uint8Array) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;

/** The pages as a PDF. `images` maps an image op's id to its JPEG (or PNG) bytes. */
export async function writePdf(pages: Page[], fonts: FontBytes, images: Record<string, Uint8Array>, meta: PdfMeta): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit as any);
  pdf.setTitle(meta.title);
  pdf.setAuthor(meta.author);
  pdf.setSubject(meta.subject);
  pdf.setCreator('Timestamp Camera');
  pdf.setProducer('Timestamp Camera');
  const embedded = {} as Record<FontKey, Awaited<ReturnType<typeof pdf.embedFont>>>;
  for (const k of Object.keys(fonts) as FontKey[]) embedded[k] = await pdf.embedFont(fonts[k], { subset: true, features: FEATURES });
  const pictures = new Map<string, Awaited<ReturnType<typeof pdf.embedJpg>>>();
  const picture = async (id: string) => {
    if (pictures.has(id)) return pictures.get(id)!;
    const bytes = images[id];
    if (!bytes) return null;
    const img = isPng(bytes) ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    pictures.set(id, img);
    return img;
  };

  for (const p of pages) {
    const page = pdf.addPage([p.width, p.height]);
    const H = p.height;
    for (const op of p.ops) {
      if (op.k === 'text') {
        page.drawText(op.text, { x: op.x, y: H - op.y, size: op.size, font: embedded[op.font], color: color(op.color) });
      } else if (op.k === 'rect') {
        page.drawRectangle({
          x: op.x,
          y: H - op.y - op.h,
          width: op.w,
          height: op.h,
          color: op.fill ? color(op.fill) : undefined,
          borderColor: op.stroke ? color(op.stroke) : undefined,
          borderWidth: op.stroke ? op.lw ?? 1 : 0,
        });
      } else if (op.k === 'line') {
        page.drawLine({ start: { x: op.x1, y: H - op.y1 }, end: { x: op.x2, y: H - op.y2 }, thickness: op.lw, color: color(op.color) });
      } else if (op.k === 'image') {
        const img = await picture(op.id);
        if (img) page.drawImage(img, { x: op.x, y: H - op.y - op.h, width: op.w, height: op.h });
      } else if (op.k === 'path') {
        page.drawSvgPath(op.d, { x: op.tx, y: H - op.ty, scale: op.s, color: color(op.color), borderWidth: 0 });
      }
    }
  }
  return pdf.save();
}
