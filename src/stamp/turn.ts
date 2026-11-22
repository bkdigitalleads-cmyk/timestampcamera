/**
 * The app is portrait only, but the camera reports how the phone is held,
 * so a photo taken sideways comes out landscape. The live stamp then has to
 * be drawn as it will print on that landscape photo: laid out on the
 * landscape frame and turned a quarter onto the portrait preview. Pure,
 * checked by `npm test`.
 *
 * landscapeLeft: the phone's top points left, so the photo's top is the
 * screen's left edge (turn -90). landscapeRight: the top points right
 * (turn 90). Upside down prints like portrait.
 */
export type Turn = 0 | 90 | -90;

export function turnFor(orientation: string | null | undefined): Turn {
  return orientation === 'landscapeLeft' ? -90 : orientation === 'landscapeRight' ? 90 : 0;
}

/** The photo's frame for a preview of `w` by `h` held at `turn`. */
export function frameFor(w: number, h: number, turn: Turn): { width: number; height: number } {
  return turn === 0 ? { width: w, height: h } : { width: h, height: w };
}

/** Where a point on the photo's frame lands on the portrait preview. */
export function toScreen(x: number, y: number, w: number, h: number, turn: Turn): { x: number; y: number } {
  if (turn === -90) return { x: y, y: h - x };
  if (turn === 90) return { x: w - y, y: x };
  return { x, y };
}
