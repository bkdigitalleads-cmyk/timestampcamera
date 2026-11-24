/**
 * The live place for the stamp, while the camera is on screen. Location is
 * "when in use" only: the watch starts when the camera shows and stops when
 * it goes away, and nothing runs in the background. The address comes from
 * the phone's geocoder (expo-location's reverseGeocodeAsync, which asks
 * Apple's location service and so sends it the coordinates), throttled by
 * stamp/place.ts, and only while `wantAddress` is true: with the stamp's
 * Address line off, no lookup is made at all. Denied or no fix: `place` is
 * null and the stamp prints the date and time only.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { formatAddress } from '../stamp/format';
import { addressFor, Fix, Looked, needsGeocode, usableFix, watchIsQuiet } from '../stamp/place';
import type { Place } from '../stamp/content';

export type LocationAccess = 'unknown' | 'granted' | 'denied' | 'ask';

/** A CoreLocation reading as a Fix; a negative speed means the phone gave none. */
function toFix(pos: Location.LocationObject): Fix {
  const sp = pos.coords.speed;
  return { lat: pos.coords.latitude, lng: pos.coords.longitude, altitude: pos.coords.altitude ?? null, accuracy: pos.coords.accuracy ?? null, speed: typeof sp === 'number' && sp >= 0 ? sp : null, at: pos.timestamp || Date.now() };
}

export function useLocation(
  active: boolean,
  wantAddress: boolean
): { place: Place | null; fix: Fix | null; access: LocationAccess; request: () => Promise<void>; placeAt: (ms: number) => Place | null } {
  const [access, setAccess] = useState<LocationAccess>('unknown');
  const [fix, setFix] = useState<Fix | null>(null);
  const [looked, setLooked] = useState<Looked | null>(null);
  const lookedRef = useRef<Looked | null>(null);
  const asking = useRef(false);
  const fixRef = useRef<Fix | null>(null);
  const lastUpdate = useRef<number | null>(null);
  const [restarts, setRestarts] = useState(0);
  const want = useRef(wantAddress);
  want.current = wantAddress;

  const check = useCallback(async () => {
    try {
      const p = await Location.getForegroundPermissionsAsync();
      setAccess(p.granted ? 'granted' : p.canAskAgain ? 'ask' : 'denied');
    } catch {
      setAccess('denied');
    }
  }, []);

  useEffect(() => {
    check();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') check();
    });
    return () => sub.remove();
  }, [check]);

  const request = useCallback(async () => {
    try {
      const p = await Location.requestForegroundPermissionsAsync();
      setAccess(p.granted ? 'granted' : p.canAskAgain ? 'ask' : 'denied');
    } catch {
      setAccess('denied');
    }
  }, []);

  const geocode = useCallback(async (f: Fix) => {
    if (asking.current || !needsGeocode(lookedRef.current, f, Date.now(), want.current)) return;
    asking.current = true;
    let address: string | null = null;
    try {
      const res = await Location.reverseGeocodeAsync({ latitude: f.lat, longitude: f.lng });
      address = formatAddress(res[0] ?? null);
    } catch {
      // no signal, or the geocoder said no: the stamp prints coordinates
    }
    const l = { lat: f.lat, lng: f.lng, address, at: Date.now() };
    lookedRef.current = l;
    setLooked(l);
    asking.current = false;
  }, []);

  useEffect(() => {
    if (!active || access !== 'granted') return;
    let sub: Location.LocationSubscription | null = null;
    let live = true;
    (async () => {
      try {
        const take = (f: Fix) => {
          // Never step back to an older reading.
          if (fixRef.current && f.at < fixRef.current.at) return;
          fixRef.current = f;
          lastUpdate.current = Date.now();
          setFix(f);
          geocode(f);
        };
        // A quick last-known fix first, so the stamp has a place at once (only if it is still usable).
        const last = await Location.getLastKnownPositionAsync({ maxAge: 10000, requiredAccuracy: 200 });
        if (live && last && usableFix(toFix(last), Date.now())) take(toFix(last));
        // Distance filter none: readings keep coming while standing still, so the fix stays fresh.
        sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, distanceInterval: 0, timeInterval: 1000 }, (pos) => {
          if (live) take(toFix(pos));
        });
        if (!live) sub.remove();
      } catch {
        // location services off: no place
      }
    })();
    // Watchdog: iOS can pause location updates on its own (CoreLocation's automatic pause is on, and
    // expo-location does not turn it off), and a paused watch does not resume by itself. If no
    // reading has come for a while, start the watch again.
    lastUpdate.current = Date.now();
    const dog = setInterval(() => {
      if (live && watchIsQuiet(lastUpdate.current, Date.now())) setRestarts((n) => n + 1);
    }, 4000);
    return () => {
      live = false;
      clearInterval(dog);
      sub?.remove();
    };
  }, [active, access, geocode, restarts]);

  // Turning the Address line on with a fix already in hand looks it up straight away.
  useEffect(() => {
    if (wantAddress && fix) geocode(fix);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantAddress]);

  /** The place for a photo taken at `ms`: the latest reading if it is still usable then, otherwise none. */
  const placeAt = useCallback(
    (ms: number): Place | null => {
      const f = access === 'granted' ? usableFix(fixRef.current, ms) : null;
      return f ? { lat: f.lat, lng: f.lng, altitude: f.altitude, address: want.current ? addressFor(lookedRef.current, f) : null } : null;
    },
    [access]
  );

  const now = Date.now();
  const current = access === 'granted' ? usableFix(fix, now) : null;
  const place: Place | null = current ? { lat: current.lat, lng: current.lng, altitude: current.altitude, address: wantAddress ? addressFor(looked, current) : null } : null;
  return { place, fix: current, access, request, placeAt };
}
