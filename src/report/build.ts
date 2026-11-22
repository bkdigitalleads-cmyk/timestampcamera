/**
 * Making the report on the phone: the fonts from the app bundle, each
 * photo's report copy downscaled by Skia (report/plan.ts says how big),
 * the pages from report/layout.ts, and the PDF from pdf-lib. Also the
 * share sheet, Print, and the before and after image.
 */
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { Skia, SkTypeface } from '@shopify/react-native-skia';
import type { FontKey } from '../pdf/ops';
import { FontBytes, makeMeasure } from '../pdf/fonts';
import { writePdf } from '../pdf/pdf';
import type { Measure } from '../pdf/ops';
import { layoutReport, Report, ReportInput } from './layout';
import { REPORT_QUALITY, reportPixels } from './plan';
import { composePair, downscaleJpeg } from '../stamp/burn';
import { readRel, shareFile } from '../store';
import type { Photo } from '../model';
import { stampTypeface } from '../capture';

const MODULES: Record<FontKey, number> = {
  regular: require('../../assets/fonts/Barlow-Regular.ttf'),
  bold: require('../../assets/fonts/Barlow-SemiBold.ttf'),
  display: require('../../assets/fonts/BarlowCondensed-SemiBold.ttf'),
};

export interface ReportKit {
  bytes: FontBytes;
  measure: Measure;
  faces: Record<FontKey, SkTypeface>;
}

let loading: Promise<ReportKit> | null = null;

export function reportKit(): Promise<ReportKit> {
  if (!loading) {
    loading = (async () => {
      const bytes = {} as FontBytes;
      const faces = {} as Record<FontKey, SkTypeface>;
      for (const k of Object.keys(MODULES) as FontKey[]) {
        const asset = Asset.fromModule(MODULES[k]);
        await asset.downloadAsync();
        bytes[k] = await new File(asset.localUri ?? asset.uri).bytes();
        const tf = Skia.Typeface.MakeFreeTypeFaceFromData(Skia.Data.fromBytes(bytes[k]));
        if (!tf) throw new Error('A report font did not load.');
        faces[k] = tf;
      }
      return { bytes, measure: makeMeasure(bytes), faces };
    })().catch((e) => {
      loading = null;
      throw e;
    });
  }
  return loading;
}

export function layout(kit: ReportKit, input: ReportInput): Report {
  return layoutReport(kit.measure, input);
}

/** Each photo's report copy, made once per size and kept while the screen is open. */
export function reportImages(report: Report, photos: Photo[], logoFile: string | null, cache: Map<string, Uint8Array>): Record<string, Uint8Array> {
  const out: Record<string, Uint8Array> = {};
  const byId = new Map(photos.map((p) => [p.id, p]));
  for (const im of report.images) {
    const p = byId.get(im.id);
    if (!p) continue;
    const px = reportPixels(im.w, im.h, p.width, p.height);
    const key = `${p.id}@${Math.max(px.width, px.height)}`;
    let bytes = cache.get(key);
    if (!bytes) {
      try {
        bytes = downscaleJpeg(Skia, readRel(p.file), Math.max(px.width, px.height), REPORT_QUALITY).bytes;
        cache.set(key, bytes);
      } catch {
        continue; // a missing file prints as an empty box rather than stop the report
      }
    }
    out[im.id] = bytes;
  }
  if (logoFile) {
    try {
      out.logo = readRel(logoFile);
    } catch {
      // no logo
    }
  }
  return out;
}

export async function reportPdf(kit: ReportKit, report: Report, images: Record<string, Uint8Array>, meta: { job: string; company: string }): Promise<Uint8Array> {
  return writePdf(report.pages, kit.bytes, images, { title: `Photo report, ${meta.job}`, author: meta.company, subject: meta.job });
}

export async function shareUri(uri: string, mimeType: string, uti: string, title: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this phone.');
  await Sharing.shareAsync(uri, { mimeType, UTI: uti, dialogTitle: title });
}

export async function sharePdf(name: string, bytes: Uint8Array): Promise<void> {
  await shareUri(shareFile(name, bytes), 'application/pdf', 'com.adobe.pdf', name);
}

export async function printPdf(name: string, bytes: Uint8Array): Promise<void> {
  await Print.printAsync({ uri: shareFile(name, bytes) });
}

/** The before and after as one side-by-side JPEG, 1440 px tall, in the share sheet. */
export async function sharePair(before: Photo, after: Photo, name: string): Promise<void> {
  const tf = await stampTypeface();
  const out = composePair(Skia, readRel(before.file), readRel(after.file), tf, 1440, 88);
  await shareUri(shareFile(name, out.bytes), 'image/jpeg', 'public.jpeg', name);
}
