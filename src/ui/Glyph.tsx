import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

/**
 * The app's own glyphs, drawn on a 24 grid with square-ish ends, like
 * marks made with a carpenter's pencil. No icon pack.
 */
export type GlyphName =
  | 'camera'
  | 'jobs'
  | 'settings'
  | 'flash'
  | 'flashOff'
  | 'stamp'
  | 'pin'
  | 'close'
  | 'back'
  | 'check'
  | 'plus'
  | 'share'
  | 'trash'
  | 'photo'
  | 'import'
  | 'pair'
  | 'list'
  | 'report'
  | 'sign'
  | 'chevron'
  | 'down'
  | 'up'
  | 'lock'
  | 'star'
  | 'more'
  | 'flip'
  | 'edit'
  | 'save'
  | 'print'
  | 'calendar'
  | 'note'
  | 'undo'
  | 'clear'
  | 'eye'
  | 'restore';

const D: Record<GlyphName, string> = {
  camera: 'M4.5 8.2c0-.9.7-1.7 1.7-1.7h2.2l1.5-2h4.2l1.5 2h2.2c.9 0 1.7.7 1.7 1.7v9.1c0 .9-.7 1.7-1.7 1.7H6.2c-.9 0-1.7-.7-1.7-1.7V8.2zM12 16.2a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2z',
  jobs: 'M3.5 7.2c0-.9.7-1.7 1.7-1.7h4.1l2 2.2h7.5c.9 0 1.7.7 1.7 1.7v8.4c0 .9-.7 1.7-1.7 1.7H5.2c-.9 0-1.7-.7-1.7-1.7V7.2zM3.5 10.5h17',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4L18 18M6 18l1.6-1.6M16.4 7.6L18 6',
  flash: 'M13 3.5L6 13.2h5.2L10.5 20.5 18 10.8h-5.3L13 3.5z',
  flashOff: 'M13 3.5l-2.3 3.2M8.6 9.7L6 13.2h5.2l-.7 7.3 3.4-4.4M15.5 13.4L18 10.8h-4M4.5 4.5l15 15',
  stamp: 'M4.5 16.5h15M4.5 19.5h9M7 5.5h10M7 9h7M7 12.5h10',
  pin: 'M12 20.5s-6-5.6-6-10.3a6 6 0 0 1 12 0c0 4.7-6 10.3-6 10.3zM12 12.3a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4z',
  close: 'M6.5 6.5l11 11M17.5 6.5l-11 11',
  back: 'M14.5 5.5L8 12l6.5 6.5',
  check: 'M5 12.5l4.2 4.2L19 7',
  plus: 'M12 5.5v13M5.5 12h13',
  share: 'M12 14.5V4M8 7.5L12 3.8l4 3.7M7.5 10.5H6.6c-.9 0-1.6.7-1.6 1.6v6.8c0 .9.7 1.6 1.6 1.6h10.8c.9 0 1.6-.7 1.6-1.6v-6.8c0-.9-.7-1.6-1.6-1.6h-.9',
  trash: 'M5 7h14M10 7V5.4c0-.5.4-.9.9-.9h2.2c.5 0 .9.4.9.9V7M7 7l.8 11.4c.1.9.8 1.6 1.7 1.6h5c.9 0 1.6-.7 1.7-1.6L17 7',
  photo: 'M5.6 5h12.8c.9 0 1.6.7 1.6 1.6v10.8c0 .9-.7 1.6-1.6 1.6H5.6c-.9 0-1.6-.7-1.6-1.6V6.6C4 5.7 4.7 5 5.6 5zM4.5 16l4.3-4.3 3.4 3.4 2.3-2.3 5 5',
  import: 'M12 3.5v9M8.5 9.5l3.5 3.5 3.5-3.5M4.5 14v4.4c0 .9.7 1.6 1.6 1.6h11.8c.9 0 1.6-.7 1.6-1.6V14',
  pair: 'M4.6 5.5h14.8c.6 0 1.1.5 1.1 1.1v10.8c0 .6-.5 1.1-1.1 1.1H4.6c-.6 0-1.1-.5-1.1-1.1V6.6c0-.6.5-1.1 1.1-1.1zM12 5.5v13M6 15l2.2-2.6 1.8 2.1M14 15l2.2-2.6 1.8 2.1',
  list: 'M4.5 5.5h3v3h-3zM4.5 15.5h3v3h-3zM5 11.8l1 1 2-2.3M11 7h8.5M11 12h8.5M11 17h8.5',
  report: 'M13.5 3.5H7.1c-.9 0-1.6.7-1.6 1.6v13.8c0 .9.7 1.6 1.6 1.6h9.8c.9 0 1.6-.7 1.6-1.6V8.5l-5-5zM13.5 3.5v5h5M8.5 12h7v4.5h-7z',
  sign: 'M3.5 15.5c2.2-.4 3.4-6.8 5.6-6.8 1.6 0 .2 6.9 2.2 6.9 1.6 0 2.4-4.3 3.9-4.3 1.2 0 .8 3.2 2.1 3.2 1 0 1.8-1.1 3.2-1.6M3.5 19.5h17',
  chevron: 'M9.5 6.5L15 12l-5.5 5.5',
  down: 'M6.5 9.5L12 15l5.5-5.5',
  up: 'M6.5 14.5L12 9l5.5 5.5',
  lock: 'M7.5 10.5V8a4.5 4.5 0 0 1 9 0v2.5M6.6 10.5h10.8c.6 0 1.1.5 1.1 1.1v7.3c0 .6-.5 1.1-1.1 1.1H6.6c-.6 0-1.1-.5-1.1-1.1v-7.3c0-.6.5-1.1 1.1-1.1z',
  star: 'M12 4.5l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.5 5-.7L12 4.5z',
  more: 'M6 12h.01M12 12h.01M18 12h.01',
  flip: 'M4.5 10a7.5 7.5 0 0 1 13.4-3.6M19.5 14a7.5 7.5 0 0 1-13.4 3.6M18.5 3.5v3.3h-3.3M5.5 20.5v-3.3h3.3',
  edit: 'M14.5 6.5l3 3M5 19l1-4L15.8 5.2c.6-.6 1.5-.6 2.1 0l.9.9c.6.6.6 1.5 0 2.1L9 18l-4 1z',
  save: 'M12 4v10.5M8 10.5l4 4 4-4M5 16.5v1.9c0 .9.7 1.6 1.6 1.6h10.8c.9 0 1.6-.7 1.6-1.6v-1.9',
  print: 'M7.5 9V4.5h9V9M7.5 16.5H5.6c-.9 0-1.6-.7-1.6-1.6v-4.3c0-.9.7-1.6 1.6-1.6h12.8c.9 0 1.6.7 1.6 1.6v4.3c0 .9-.7 1.6-1.6 1.6h-1.9M7.5 13.5h9v6h-9z',
  calendar: 'M6.1 6h11.8c.9 0 1.6.7 1.6 1.6v10.8c0 .9-.7 1.6-1.6 1.6H6.1c-.9 0-1.6-.7-1.6-1.6V7.6c0-.9.7-1.6 1.6-1.6zM4.5 10.5h15M8.5 4v3.5M15.5 4v3.5',
  note: 'M5.5 4.5h13v15h-13zM8.5 9h7M8.5 12.5h7M8.5 16h4',
  undo: 'M8.5 6L5 9.5 8.5 13M5.5 9.5h8.3c2.8 0 5 2.2 5 5s-2.2 5-5 5H10',
  clear: 'M4 19.5h16M6.5 14.5c2-1 3.3-5.7 5.4-5.7 1.5 0 .6 4.6 2.3 4.6 1.2 0 2-2.5 3.3-3.1M5 5l14 14',
  eye: 'M2.8 12S6.2 5.8 12 5.8 21.2 12 21.2 12 17.8 18.2 12 18.2 2.8 12 2.8 12zM12 14.8a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6z',
  restore: 'M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4v3.5H8',
};

export default function Glyph({ name, size = 24, color, weight = 1.9, fill }: { name: GlyphName; size?: number; color: string; weight?: number; fill?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      <Path d={D[name]} stroke={color} strokeWidth={weight} strokeLinecap="round" strokeLinejoin="round" fill={fill ?? 'none'} />
      {name === 'photo' ? <Circle cx={15} cy={9.5} r={1.3} fill={color} /> : null}
      {name === 'more' ? [6, 12, 18].map((x) => <Circle key={x} cx={x} cy={12} r={1.6} fill={color} />) : null}
    </Svg>
  );
}
