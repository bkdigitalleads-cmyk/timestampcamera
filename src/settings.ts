/**
 * The person's settings, stored as small values in the kv table. Pure
 * parsing with fallbacks (a damaged value never stops the app), checked by
 * `npm test`.
 */
import type { Paper } from './pdf/ops.ts';

export const KEYS = {
  stamp: 'settings.stamp',
  company: 'settings.company',
  logo: 'settings.logo',
  saveToPhotos: 'settings.saveToPhotos',
  currentJob: 'settings.currentJob',
  firstDay: 'flag.firstDay',
  signoff: (jobId: string) => `signoff.${jobId}`,
} as const;

/** The logo: a PNG in the documents folder and its pixel size. */
export interface Logo {
  file: string;
  width: number;
  height: number;
}

export function parseLogo(json: string | null): Logo | null {
  try {
    const v = JSON.parse(json ?? 'null');
    if (v && typeof v.file === 'string' && v.file && v.width > 0 && v.height > 0) return { file: v.file, width: Number(v.width), height: Number(v.height) };
  } catch {
    // fall through
  }
  return null;
}

/** US Letter where it is the habit (the Americas' letter countries and the Philippines), A4 elsewhere. */
export function paperFor(region: string | null | undefined): Paper {
  return ['US', 'CA', 'MX', 'PH', 'CL', 'CO', 'VE', 'GT', 'PR', 'DO', 'CR', 'PA', 'SV', 'NI', 'HN', 'BO'].includes((region ?? '').toUpperCase()) ? 'letter' : 'a4';
}

/** "Report Miller kitchen 2026-11-22.pdf": readable, safe on every file system. */
export function fileName(parts: string[], ext: 'pdf' | 'jpg'): string {
  const clean = parts
    .join(' ')
    .replace(/[\\/:*?"<>|,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return `${clean || 'Photo'}.${ext}`;
}
