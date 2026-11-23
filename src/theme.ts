/**
 * "Site board." A work tool used outdoors, with one hand, often with
 * gloves or dirty fingers.
 *
 * - The camera is dark chrome (near-black, matte), so the picture is the
 *   brightest thing on the screen and the controls do not glare in sun.
 * - Everything outside the camera is light and plain: a pale concrete
 *   background, white cards, near-black ink.
 * - One accent, hi-vis yellow, like a safety vest or a level's vial. It is
 *   only ever a fill with ink lettering (yellow text on white would not
 *   read), and it means one thing: the main action on the screen (the
 *   shutter ring, Build report, Share report, Continue).
 * - Type is Barlow (SIL OFL, assets/fonts): Barlow Condensed SemiBold for
 *   titles, labels and the main button, lettered like a site sign; Barlow
 *   SemiBold for the stamp itself. Body text is the system font, which reads
 *   best small and follows Dynamic Type.
 */
export interface Theme {
  /** Screen background outside the camera. */
  bg: string;
  /** Cards, lists, sheets. */
  card: string;
  /** Unselected chips, wells, pressed rows. */
  well: string;
  ink: string;
  inkSoft: string;
  inkFaint: string;
  /** Hairlines between rows. */
  rule: string;
  /** 1 px edges of cards and fields. */
  edge: string;
  /** The main action. Always a fill, always with `onAccent` lettering. */
  accent: string;
  onAccent: string;
  /** The darker lip under the main button, so it reads on white. */
  accentEdge: string;
  danger: string;
  /** Done tags in the punch list. */
  good: string;
  scrim: string;
  /** Camera chrome. */
  chrome: string;
  chromeRaised: string;
  chromeInk: string;
  chromeSoft: string;
}

export const theme: Theme = {
  bg: '#F3F4F1',
  card: '#FFFFFF',
  well: '#E6E8E3',
  ink: '#15181B',
  inkSoft: '#545A60',
  inkFaint: '#868C92',
  rule: '#E1E3DE',
  edge: 'rgba(21, 24, 27, 0.13)',
  accent: '#FFC61A',
  onAccent: '#15181B',
  accentEdge: '#C99700',
  danger: '#B42318',
  good: '#1E6F46',
  scrim: 'rgba(12, 14, 16, 0.45)',
  chrome: '#0F1113',
  chromeRaised: '#202428',
  chromeInk: '#F4F5F2',
  chromeSoft: '#A3AAB1',
};

/** One theme: light outside the camera, dark chrome on it (app.json pins light). */
export function useTheme(): Theme {
  return theme;
}

/** Corners: cards and sheets 10, fields and chips 8. Round only for circles. */
export const radius = { card: 10, chip: 8, round: 999 };

/** The spacing scale. Every margin, padding and gap is one of these. */
export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 };

export const fonts = {
  display: 'TC-Condensed',
  stamp: 'TC-Stamp',
};

/**
 * One type scale:
 *  - title 32: screen titles and onboarding lines (condensed)
 *  - heading 22: section heads on long screens (condensed)
 *  - body 17 / strong 17: rows and text (system)
 *  - small 13: second lines
 *  - label 13: field labels, condensed capitals
 *  - button 20: the main button, condensed capitals
 */
export const type = {
  title: { fontFamily: fonts.display, fontSize: 32, lineHeight: 36 },
  heading: { fontFamily: fonts.display, fontSize: 22, lineHeight: 26 },
  body: { fontSize: 17, lineHeight: 23 },
  strong: { fontSize: 17, lineHeight: 23, fontWeight: '600' as const },
  small: { fontSize: 13, lineHeight: 18 },
  label: { fontFamily: fonts.display, fontSize: 14, lineHeight: 17, letterSpacing: 1, textTransform: 'uppercase' as const },
  button: { fontFamily: fonts.display, fontSize: 21, lineHeight: 24, letterSpacing: 0.8, textTransform: 'uppercase' as const },
};

/** The main button is at least this tall. */
export const MAIN_BUTTON = 60;
/** The shutter's outer diameter: big enough for a gloved thumb. */
export const SHUTTER = 92;

/** UI font files for useFonts in App.tsx. */
export const UI_FONT_FILES = {
  [fonts.display]: require('../assets/fonts/BarlowCondensed-SemiBold.ttf'),
  [fonts.stamp]: require('../assets/fonts/Barlow-SemiBold.ttf'),
};
