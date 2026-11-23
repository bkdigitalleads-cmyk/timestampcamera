/**
 * Keeping the live place current without waiting on anything. Pure, no
 * imports, checked by `npm test`.
 *
 * The phone's position streams in while the camera is open. The address
 * comes from the device geocoder (Apple's location service, which receives
 * the coordinates for the lookup), needs signal and can be slow, so it is
 * asked only while the Address line is on, and again only after moving or
 * after a while, and an address is
 * used only while the phone is still near where it was looked up. The
 * shutter never waits: what the live stamp shows at that moment prints.
 */

export interface Fix {
  lat: number;
  lng: number;
  altitude: number | null;
  /** Horizontal accuracy in meters, when the phone gave one. */
  accuracy: number | null;
  at: number;
}

export interface Looked {
  lat: number;
  lng: number;
  address: string | null;
  at: number;
}

/** Meters between two points on the globe (haversine). */
export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * Ask the geocoder again: never asked, moved 25 m, or 2 minutes since a
 * failed ask (or 10 since a good one). Never when the stamp's Address line
 * is off: the lookup sends the coordinates to Apple's location service, so
 * it is made only when the address will print.
 */
export function needsGeocode(last: Looked | null, fix: Fix, now: number, wantAddress = true): boolean {
  if (!wantAddress) return false;
  if (!last) return true;
  if (distanceMeters(last, fix) > 25) return true;
  return now - last.at > (last.address ? 10 * 60000 : 2 * 60000);
}

/** The address for this fix, if it was looked up within 60 m of here; otherwise null (the stamp prints coordinates). */
export function addressFor(last: Looked | null, fix: Fix | null): string | null {
  if (!last || !fix || !last.address) return null;
  return distanceMeters(last, fix) <= 60 ? last.address : null;
}

/** A fix older than 2 minutes is not where the phone is now: the stamp leaves the place off rather than print a stale one. */
export function freshFix(fix: Fix | null, now: number): Fix | null {
  return fix && now - fix.at <= 2 * 60000 ? fix : null;
}

/** A map picture made within 40 m of here can still go on the stamp. */
export function mapStillGood(mapAt: { lat: number; lng: number } | null, fix: Fix | null): boolean {
  return !!mapAt && !!fix && distanceMeters(mapAt, fix) <= 40;
}
