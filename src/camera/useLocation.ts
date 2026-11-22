/**
 * The live place for the stamp, while the camera is on screen. Location is
 * "when in use" only: the watch starts when the camera shows and stops when
 * it goes away, and nothing runs in the background. The address comes from
 * the phone's own geocoder (expo-location's reverseGeocodeAsync), throttled
 * by stamp/place.ts. Denied or no fix: `place` is null and the stamp prints
 * the date and time only.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { formatAddress } from '../stamp/format';
import { addressFor, Fix, freshFix, Looked, needsGeocode } from '../stamp/place';
import type { Place } from '../stamp/content';

export type LocationAccess = 'unknown' | 'granted' | 'denied' | 'ask';

export function useLocation(active: boolean): { place: Place | null; fix: Fix | null; access: LocationAccess; request: () => Promise<void> } {
  const [access, setAccess] = useState<LocationAccess>('unknown');
  const [fix, setFix] = useState<Fix | null>(null);
  const [looked, setLooked] = useState<Looked | null>(null);
  const lookedRef = useRef<Looked | null>(null);
  const asking = useRef(false);

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
    if (asking.current || !needsGeocode(lookedRef.current, f, Date.now())) return;
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
        // A quick last-known fix first, so the stamp has a place at once.
        const last = await Location.getLastKnownPositionAsync({ maxAge: 2 * 60000, requiredAccuracy: 200 });
        if (live && last) {
          const f = { lat: last.coords.latitude, lng: last.coords.longitude, altitude: last.coords.altitude ?? null, accuracy: last.coords.accuracy ?? null, at: last.timestamp };
          setFix(f);
          geocode(f);
        }
        sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, distanceInterval: 3, timeInterval: 2000 }, (pos) => {
          const f = { lat: pos.coords.latitude, lng: pos.coords.longitude, altitude: pos.coords.altitude ?? null, accuracy: pos.coords.accuracy ?? null, at: pos.timestamp || Date.now() };
          setFix(f);
          geocode(f);
        });
        if (!live) sub.remove();
      } catch {
        // location services off: no place
      }
    })();
    return () => {
      live = false;
      sub?.remove();
    };
  }, [active, access, geocode]);

  const now = Date.now();
  const current = access === 'granted' ? freshFix(fix, now) : null;
  const place: Place | null = current ? { lat: current.lat, lng: current.lng, altitude: current.altitude, address: addressFor(looked, current) } : null;
  return { place, fix: current, access, request };
}
