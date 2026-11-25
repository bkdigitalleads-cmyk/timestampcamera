/**
 * Shutter rules as pure functions, checked by `npm test`.
 *
 * Build 2 crashed (Brian's test, Nov 24, 2026) when the shutter was pressed
 * right after coming back to the camera from a punch list item. expo-camera's
 * takePicture calls AVCapturePhotoOutput.capturePhoto without checking that
 * the capture session is running; on a stopped session iOS raises an
 * Objective-C exception ("No active and enabled video connection") that
 * JavaScript cannot catch, so the app dies. The camera is stopped whenever a
 * screen covers it, and its onCameraReady event fires once per native view,
 * so the old `ready` flag stayed true after the camera was stopped. Now the
 * camera view is mounted only while the camera is on screen (a fresh view
 * fires onCameraReady again only after its session is running), `ready`
 * drops the moment the camera is covered, and a press while not ready waits
 * for ready instead of calling the camera.
 */

/** A press may call the camera only when it is on screen, allowed, and its session has said ready. */
export function canCapture(s: { permission: boolean; active: boolean; ready: boolean }): boolean {
  return s.permission && s.active && s.ready;
}

/** How long a press waits for the camera to become ready before it gives up and says so. */
export const READY_WAIT_MS = 3000;

/**
 * Stamping a 12 MP photo holds the JavaScript thread for a moment, and every
 * touch and haptic waits behind it. While photos are being taken in a burst,
 * the stamping waits: it starts only when no capture is in flight and the
 * shutter has been still for this long.
 */
export const SHUTTER_IDLE_MS = 1200;

export function burnMayStart(s: { now: number; lastPressAt: number; capturing: number }): boolean {
  return s.capturing === 0 && s.now - s.lastPressAt >= SHUTTER_IDLE_MS;
}

/**
 * Before is one reference shot, so it applies to the next photo only and the
 * switch falls back to Photo the moment that photo is taken. (Build 3 kept
 * it on: one tap on Before, or a brush of the chip just above the shutter,
 * made every later photo a Before, in every job, until it was switched off.)
 */
export function beforeAfterPress(beforeOn: boolean, role: 'before' | 'after' | null): boolean {
  return role === 'before' ? false : beforeOn;
}

/**
 * What a photo is: the role it gets from the camera's mode. The Before
 * switch is only on screen in photo mode, so a photo for a punch list item
 * never becomes a Before because the switch was left on earlier.
 */
export function photoRole(mode: 'photo' | 'after' | 'item', beforeOn: boolean, pairsAllowed: boolean): 'before' | 'after' | null {
  if (mode === 'after') return 'after';
  if (mode === 'item') return null;
  return beforeOn && pairsAllowed ? 'before' : null;
}
