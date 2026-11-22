/**
 * The map thumbnail for the Full stamp (Pro, off unless turned on). A
 * small map view sits out of sight behind the camera chrome; when the phone
 * has moved more than 40 m from the last picture, the map moves there and a
 * PNG snapshot is taken. The shutter never waits for it: a photo uses the
 * last good picture, or prints without a map.
 *
 * The map is Apple Maps (react-native-maps' default on iOS, no key). Like
 * any map in any app, Apple's servers send the map for the area shown; the
 * photos and the stamp never leave the phone. Settings says so beside the
 * switch.
 */
import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';
import MapView from 'react-native-maps';
import { base64ToBytes } from '../pdf/base64';
import { mapStillGood } from '../stamp/place';
import type { Fix } from '../stamp/place';

export interface MapPicture {
  lat: number;
  lng: number;
  png: Uint8Array;
}

const SIZE = 240;

export default function MapThumb({ fix, enabled, onPicture, current }: { fix: Fix | null; enabled: boolean; onPicture: (p: MapPicture) => void; current: MapPicture | null }) {
  const ref = useRef<MapView>(null);
  const busy = useRef(false);

  useEffect(() => {
    if (!enabled || !fix || busy.current || mapStillGood(current, fix)) return;
    busy.current = true;
    const at = { lat: fix.lat, lng: fix.lng };
    const region = { latitude: at.lat, longitude: at.lng, latitudeDelta: 0.004, longitudeDelta: 0.004 };
    ref.current?.animateToRegion(region, 0);
    // Give the tiles a moment to draw; with no signal the picture is skipped.
    const t = setTimeout(async () => {
      try {
        const b64 = await ref.current?.takeSnapshot({ width: SIZE, height: SIZE, region, format: 'png', result: 'base64' });
        if (b64) onPicture({ ...at, png: base64ToBytes(b64) });
      } catch {
        // no map this time
      }
      busy.current = false;
    }, 1800);
    return () => {
      clearTimeout(t);
      busy.current = false;
    };
  }, [enabled, fix, current, onPicture]);

  if (!enabled) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: -SIZE * 2, top: 0, width: SIZE / 2, height: SIZE / 2, opacity: 0 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <MapView ref={ref} style={{ width: SIZE / 2, height: SIZE / 2 }} showsPointsOfInterests={false} showsBuildings={false} showsCompass={false} pitchEnabled={false} rotateEnabled={false} scrollEnabled={false} zoomEnabled={false} toolbarEnabled={false} />
    </View>
  );
}
