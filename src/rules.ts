/**
 * Small behavior rules as pure functions checked by `npm test`: when a
 * rating prompt may ask, and what happens after the onboarding paywall.
 */

/**
 * When the app asks for an App Store rating (SKStoreReviewController, through
 * expo-store-review). Each is a moment the person just got something:
 *   reportShared - a photo report went out through the share sheet or print
 *   tenPhotos    - a launch on a later day than the first, with ten photos taken
 */
export type ReviewTrigger = 'reportShared' | 'tenPhotos';

/** Photos taken before the launch trigger can ask. */
export const REVIEW_PHOTOS = 10;

/**
 * A rating prompt: never while the camera is open (it would cover the
 * viewfinder mid-job), at most one per launch, each trigger once ever.
 */
export function reviewAllowed(opts: { cameraOpen: boolean; askedThisLaunch: boolean; triggerUsed: boolean }): boolean {
  return !opts.cameraOpen && !opts.askedThisLaunch && !opts.triggerUsed;
}

/** The whole decision for one ask: the guard above, and StoreKit able to show one at all. */
export function shouldAsk(opts: { cameraOpen: boolean; askedThisLaunch: boolean; triggerUsed: boolean; storeCanAsk: boolean }): boolean {
  return reviewAllowed(opts) && opts.storeCanAsk;
}

/** The launch trigger is due: ten photos or more, and today is not the day of the first launch. */
export function launchReviewDue(opts: { photoCount: number; firstDay: string | null; today: string }): boolean {
  return opts.photoCount >= REVIEW_PHOTOS && opts.firstDay != null && opts.firstDay !== opts.today;
}

/**
 * When the onboarding paywall closes: with Pro, straight to the camera; with
 * the X, the small "what stays free" sheet first.
 */
export function afterOnboardingPaywall(isPro: boolean): 'app' | 'claim' {
  return isPro ? 'app' : 'claim';
}
