import * as StoreReview from 'expo-store-review';
import { kvGet, kvSet } from './store';
import { ReviewTrigger, shouldAsk } from './rules';

export type { ReviewTrigger } from './rules';

/**
 * App Store rating asks, at moments the person just got something (the
 * triggers are listed in rules.ts): after a photo report is shared, and on
 * a later-day launch after ten photos. Each fires at most once ever, at
 * most one prompt per launch, never while the camera is open, and StoreKit
 * still decides whether the prompt is shown (it caps it at 3 a year). The
 * decisions are pure functions in rules.ts, checked by `npm test`.
 * Engine copy (Estimate Maker); the guard is "camera open" here.
 */
const triggerKey = (t: ReviewTrigger) => `review.${t}`;

let launchState: 'idle' | 'checking' | 'asked' = 'idle';
let cameraOpen: () => boolean = () => true;

/** App.tsx tells this module whether the camera is on screen. */
export function setReviewGuard(isCameraOpen: () => boolean): void {
  cameraOpen = isCameraOpen;
}

export async function maybeRequestReview(trigger: ReviewTrigger): Promise<void> {
  if (launchState !== 'idle' || cameraOpen()) return;
  launchState = 'checking';
  try {
    const used = (await kvGet(triggerKey(trigger))) != null;
    const storeCanAsk = await StoreReview.hasAction();
    if (!shouldAsk({ cameraOpen: cameraOpen(), askedThisLaunch: false, triggerUsed: used, storeCanAsk })) return;
    await kvSet(triggerKey(trigger), '1');
    launchState = 'asked';
    setTimeout(() => {
      // One last look: the camera opened in the meantime wins.
      if (!cameraOpen()) StoreReview.requestReview().catch(() => {});
    }, 1200);
  } catch {
    // never let review plumbing get in the way
  } finally {
    if (launchState === 'checking') launchState = 'idle';
  }
}
