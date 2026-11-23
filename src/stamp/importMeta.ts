/**
 * The date and place an imported photo stamps with, from the file itself.
 * Pure, checked by `npm test`.
 *
 * Our own EXIF read of the bytes comes first; the picker's EXIF dictionary
 * is the fallback (it can carry the date and GPS when the file was
 * converted on the way in). With no date in either, the stamp leaves the
 * date and time off rather than print today's: an imported photo never
 * claims a time it does not have.
 */
import { parseExifDate } from './exif.ts';
import type { JpegInfo } from './exif.ts';
import { validCoords } from './format.ts';

export interface ImportMeta {
  takenAt: number | null;
  lat: number | null;
  lng: number | null;
  altitude: number | null;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);

export function importMeta(info: Pick<JpegInfo, 'takenAt' | 'lat' | 'lng' | 'altitude'> | null, exif: Record<string, unknown> | null | undefined): ImportMeta {
  let takenAt = info?.takenAt ?? null;
  let lat = info?.lat ?? null;
  let lng = info?.lng ?? null;
  let altitude = info?.altitude ?? null;
  if (exif) {
    const e = exif as Record<string, any>;
    const gps = (e['{GPS}'] as Record<string, unknown> | undefined) ?? e;
    if (takenAt == null) takenAt = parseExifDate(String(e.DateTimeOriginal ?? e['{Exif}']?.DateTimeOriginal ?? e.DateTime ?? ''));
    if (lat == null || lng == null) {
      const la = num(gps.GPSLatitude ?? gps.Latitude);
      const lo = num(gps.GPSLongitude ?? gps.Longitude);
      const laRef = String(gps.GPSLatitudeRef ?? gps.LatitudeRef ?? 'N').toUpperCase();
      const loRef = String(gps.GPSLongitudeRef ?? gps.LongitudeRef ?? 'E').toUpperCase();
      if (la != null && lo != null) {
        const sLat = laRef.startsWith('S') ? -Math.abs(la) : la;
        const sLng = loRef.startsWith('W') ? -Math.abs(lo) : lo;
        if (validCoords(sLat, sLng)) {
          lat = sLat;
          lng = sLng;
          const alt = num(gps.GPSAltitude ?? gps.Altitude);
          altitude = alt == null ? null : Number(gps.GPSAltitudeRef ?? 0) === 1 ? -alt : alt;
        }
      }
    }
  }
  if (!validCoords(lat, lng)) {
    lat = null;
    lng = null;
    altitude = null;
  }
  return { takenAt, lat, lng, altitude };
}
