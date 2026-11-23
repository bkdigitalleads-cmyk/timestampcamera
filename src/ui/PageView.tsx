/**
 * One report page drawn on screen by Skia from the same operations pdf-lib
 * writes into the PDF, with the same font files and the same photo copies,
 * so the preview is the report.
 */
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { Canvas, Picture, Skia, SkImage, SkTypeface } from '@shopify/react-native-skia';
import type { FontKey, Page } from '../pdf/ops';

export default function PageView({ page, width, faces, images, label }: { page: Page; width: number; faces: Record<FontKey, SkTypeface>; images: Record<string, SkImage | null>; label: string }) {
  const k = width / page.width;
  const height = Math.round(page.height * k);
  const picture = useMemo(() => {
    const rec = Skia.PictureRecorder();
    const c = rec.beginRecording(Skia.XYWHRect(0, 0, width, height));
    c.scale(k, k);
    const white = Skia.Paint();
    white.setColor(Skia.Color('#FFFFFF'));
    c.drawRect(Skia.XYWHRect(0, 0, page.width, page.height), white);
    const fonts = new Map<string, ReturnType<typeof Skia.Font>>();
    const font = (f: FontKey, size: number) => {
      const key = `${f}${size}`;
      if (!fonts.has(key)) fonts.set(key, Skia.Font(faces[f], size));
      return fonts.get(key)!;
    };
    for (const op of page.ops) {
      const p = Skia.Paint();
      if (op.k === 'text') {
        p.setColor(Skia.Color(op.color));
        c.drawText(op.text, op.x, op.y, p, font(op.font, op.size));
      } else if (op.k === 'rect') {
        if (op.fill) {
          p.setColor(Skia.Color(op.fill));
          c.drawRect(Skia.XYWHRect(op.x, op.y, op.w, op.h), p);
        }
        if (op.stroke) {
          const s = Skia.Paint();
          s.setColor(Skia.Color(op.stroke));
          s.setStyle(1);
          s.setStrokeWidth(op.lw ?? 1);
          c.drawRect(Skia.XYWHRect(op.x, op.y, op.w, op.h), s);
        }
      } else if (op.k === 'line') {
        p.setColor(Skia.Color(op.color));
        p.setStrokeWidth(op.lw);
        c.drawLine(op.x1, op.y1, op.x2, op.y2, p);
      } else if (op.k === 'image') {
        const img = images[op.id];
        if (img) c.drawImageRect(img, Skia.XYWHRect(0, 0, img.width(), img.height()), Skia.XYWHRect(op.x, op.y, op.w, op.h), p);
        else {
          p.setColor(Skia.Color('#EEF0EC'));
          c.drawRect(Skia.XYWHRect(op.x, op.y, op.w, op.h), p);
        }
      } else if (op.k === 'path') {
        const path = Skia.Path.MakeFromSVGString(op.d);
        if (path) {
          p.setColor(Skia.Color(op.color));
          c.save();
          c.translate(op.tx, op.ty);
          c.scale(op.s, op.s);
          c.drawPath(path, p);
          c.restore();
        }
      }
    }
    return rec.finishRecordingAsPicture();
  }, [page, width, height, k, faces, images]);
  return (
    <View style={{ width, height, backgroundColor: '#FFFFFF' }} accessible accessibilityRole="image" accessibilityLabel={label}>
      <Canvas style={{ width, height }}>
        <Picture picture={picture} />
      </Canvas>
    </View>
  );
}
