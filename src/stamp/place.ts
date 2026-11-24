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
  /** Speed in meters a second, as the phone reported it with the fix; null when it gave none. */
  speed?: number | null;
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

/**
 * How old a fix may be and still go on a photo. A fix is the phone's own
 * report of where it was at one moment; it is reused only while it still
 * says where the phone is:
 *  - at most 30 seconds old, and
 *  - not so old that, at the speed the phone reported with it, the phone
 *    could have moved more than 50 meters since (on a train at 30 m/s that
 *    is under 2 seconds; walking at 1.5 m/s it is the full 30 seconds);
 *  - with no speed reported, at most 10 seconds old.
 * Anything older prints no place. 50 meters is about a house front: inside
 * it, the address looked up for the fix is still the address of the spot.
 * (Build 2 accepted any fix up to 2 minutes old, which on a train could be
 * kilometers away.)
 */
export const FIX_MAX_AGE_MS = 30000;
export const FIX_NO_SPEED_MAX_AGE_MS = 10000;
export const FIX_MAX_DRIFT_M = 50;

export function usableFix(fix: Fix | null, now: number): Fix | null {
  if (!fix) return null;
  const age = Math.max(0, now - fix.at);
  const speed = typeof fix.speed === 'number' && Number.isFinite(fix.speed) && fix.speed >= 0 ? fix.speed : null;
  if (speed == null) return age <= FIX_NO_SPEED_MAX_AGE_MS ? fix : null;
  if (age > FIX_MAX_AGE_MS) return null;
  return (speed * age) / 1000 <= FIX_MAX_DRIFT_M ? fix : null;
}

/** The watch has gone quiet this long (iOS can pause location updates on its own): restart it. */
export const WATCH_QUIET_MS = 10000;

export function watchIsQuiet(lastUpdateAt: number | null, now: number): boolean {
  return lastUpdateAt == null || now - lastUpdateAt > WATCH_QUIET_MS;
}

/** A map picture made within 40 m of here can still go on the stamp. */
export function mapStillGood(mapAt: { lat: number; lng: number } | null, fix: Fix | null): boolean {
  return !!mapAt && !!fix && distanceMeters(mapAt, fix) <= 40;
}
