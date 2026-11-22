/**
 * The three fonts of every report (Barlow, SIL OFL, assets/fonts) and
 * text measuring with fontkit, exactly the way pdf-lib measures when it
 * sets the text: glyph advances, no kerning, no ligatures. Pure; the app
 * hands in the bytes (pdfAssets.ts), the tests read them from disk.
 */
import fontkit from '@pdf-lib/fontkit';
import type { FontKey, Measure } from './ops.ts';

export type FontBytes = Record<FontKey, Uint8Array>;

/** The files behind each key, under assets/fonts. */
export const FONT_FILES: Record<FontKey, string> = {
  regular: 'Barlow-Regular.ttf',
  bold: 'Barlow-SemiBold.ttf',
  display: 'BarlowCondensed-SemiBold.ttf',
};

/** OpenType features off, so measured widths are what pdf-lib sets. */
export const FEATURES = { liga: false, clig: false, kern: false };

interface FkFont {
  unitsPerEm: number;
  layout(text: string, features?: object): { glyphs: { advanceWidth: number }[] };
  hasGlyphForCodePoint(cp: number): boolean;
}

export function makeMeasure(bytes: FontBytes): Measure {
  const fonts = {} as Record<FontKey, FkFont>;
  for (const k of Object.keys(bytes) as FontKey[]) fonts[k] = (fontkit as any).create(bytes[k]) as FkFont;
  const cache = new Map<string, number>();
  const clean = (text: string, font: FontKey) => {
    const f = fonts[font];
    let out = '';
    for (const ch of String(text ?? '').replace(/\t/g, ' ')) {
      const cp = ch.codePointAt(0)!;
      if (cp === 10 || cp === 13) out += ch;
      else if (cp < 32 || (cp >= 0xfe00 && cp <= 0xfe0f) || cp === 0x200d) continue;
      else out += f.hasGlyphForCodePoint(cp) ? ch : '?';
    }
    return out;
  };
  return {
    clean,
    width(text, font, size) {
      const key = `${font}|${text}`;
      let units = cache.get(key);
      if (units == null) {
        const f = fonts[font];
        units = f.layout(text, FEATURES).glyphs.reduce((a, g) => a + g.advanceWidth, 0) / f.unitsPerEm;
        if (cache.size > 4000) cache.clear();
        cache.set(key, units);
      }
      return units * size;
    },
  };
}
