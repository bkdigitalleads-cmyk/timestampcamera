/**
 * The live stamp, drawn over the camera preview (or any picture) by the
 * same layout and the same drawing as the burn (stamp/layout.ts and
 * stamp/burn.ts drawStamp), at the size of the view. Because sizes follow
 * the short side, the stamp sits exactly where it will print on the photo.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Canvas, Picture, Skia, SkImage, SkTypeface } from '@shopify/react-native-skia';
import { drawStamp, skiaMeasure } from '../stamp/burn';
import { layoutStamp } from '../stamp/layout';
import type { StampContent, StampSettings } from '../stamp/content';
import { stampTypeface } from '../capture';
import { frameFor, Turn } from '../stamp/turn';

/** The stamp font, once it is loaded. */
export function useStampFont(): SkTypeface | null {
  const [tf, setTf] = useState<SkTypeface | null>(null);
  useEffect(() => {
    let live = true;
    stampTypeface()
      .then((t) => live && setTf(t))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return tf;
}

/** Decodes bytes into a Skia image, kept while the bytes stay the same. */
export function useSkImage(bytes: Uint8Array | null | undefined): SkImage | null {
  return useMemo(() => (bytes && bytes.length ? Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(bytes)) : null), [bytes]);
}

export default function StampLayer({ width, height, content, settings, logo, map, typeface, turn = 0 }: { width: number; height: number; content: StampContent; settings: Pick<StampSettings, 'corner' | 'size' | 'template'>; logo: SkImage | null; map: SkImage | null; typeface: SkTypeface | null; /** The phone held sideways: the stamp is laid out on the landscape frame and turned onto the preview. */ turn?: Turn }) {
  const picture = useMemo(() => {
    if (!typeface || width <= 0 || height <= 0) return null;
    const frame = frameFor(width, height, turn);
    const layout = layoutStamp({
      lines: content.lines,
      width: frame.width,
      height: frame.height,
      corner: settings.corner,
      size: settings.size,
      measure: skiaMeasure(Skia, typeface),
      logoAspect: content.logo && logo ? logo.width() / Math.max(1, logo.height()) : null,
      map: content.map && map != null,
      singleLine: settings.template === 'compact',
    });
    const rec = Skia.PictureRecorder();
    const canvas = rec.beginRecording(Skia.XYWHRect(0, 0, width, height));
    // Same mapping as stamp/turn.ts toScreen.
    if (turn === -90) {
      canvas.translate(0, height);
      canvas.rotate(-90, 0, 0);
    } else if (turn === 90) {
      canvas.translate(width, 0);
      canvas.rotate(90, 0, 0);
    }
    drawStamp(Skia, canvas, layout, typeface, { logo: content.logo ? logo : null, map: content.map ? map : null });
    return rec.finishRecordingAsPicture();
  }, [typeface, width, height, content, settings.corner, settings.size, settings.template, logo, map, turn]);

  if (!picture) return null;
  return (
    <Canvas style={[StyleSheet.absoluteFill, { width, height }]} pointerEvents="none">
      <Picture picture={picture} />
    </Canvas>
  );
}
