/**
 * Plan and trial rules as pure functions (no imports), checked by `npm test`.
 * The store objects come from RevenueCat; these only look at plain fields,
 * so prices and trial lengths always come from StoreKit.
 *
 * Engine copy (Estimate Maker 1.0.0, from Signature Maker 1.0.2, Migraine
 * Log, Image to Text, Pumping and Odo 1.0.6), unchanged: three rows, weekly ($rc_weekly, with the free
 * trial), yearly ($rc_annual) and lifetime ($rc_lifetime, a one-time
 * non-consumable). One change from Signature Maker: weekly is listed first
 * and preselected on both paywalls, as briefed. trialLength,
 * trialLabelFrom, trialReminderAt and yearlySavingPct are unchanged.
 */

export interface IntroLike {
  price: number;
  periodNumberOfUnits: number;
  /** 'DAY' | 'WEEK' | 'MONTH' | 'YEAR' */
  periodUnit: string;
}

/** "3 days" for a free trial, or null when the intro offer is not free. */
export function trialLength(intro: IntroLike | null | undefined): string | null {
  if (!intro || intro.price !== 0 || !(intro.periodNumberOfUnits > 0)) return null;
  const n = intro.periodNumberOfUnits;
  const unit = intro.periodUnit.toLowerCase();
  return `${n} ${unit}${n === 1 ? '' : 's'}`;
}

/** "3 days free", only when the trial exists and this Apple ID can still get it. */
export function trialLabelFrom(intro: IntroLike | null | undefined, eligible: boolean): string | null {
  const len = eligible ? trialLength(intro) : null;
  return len ? `${len} free` : null;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * When the "trial ends tomorrow" reminder fires: a day before the trial
 * ends. Sandbox trials last minutes, so when that is under an hour away
 * (or the end is unknown), 2 days from now instead; the foreground check
 * cancels it once the trial is over.
 */
export function trialReminderAt(expiresMs: number | null, now: number): number {
  const at = expiresMs != null ? expiresMs - DAY : now + 2 * DAY;
  return at < now + HOUR ? now + 2 * DAY : at;
}

export type PlanType = 'WEEKLY' | 'ANNUAL' | 'LIFETIME';

/** RevenueCat's packageType for the three packages; anything else is not shown. */
export function planTypeOf(packageType: string): PlanType | null {
  return packageType === 'WEEKLY' || packageType === 'ANNUAL' || packageType === 'LIFETIME' ? packageType : null;
}

/**
 * The plans shown, in order: weekly first (it carries the free trial), then
 * yearly, then lifetime, on the onboarding paywall and in the app alike.
 * (Signature Maker put lifetime first in the app; this app was briefed with
 * weekly first and preselected everywhere.)
 */
export function planOrder(_onboarding: boolean): PlanType[] {
  return ['WEEKLY', 'ANNUAL', 'LIFETIME'];
}

/** The preselected plan among those the store returned. */
export function preselect(available: string[], onboarding: boolean): PlanType | null {
  for (const t of planOrder(onboarding)) if (available.includes(t)) return t;
  return null;
}

/** The row title for a plan. */
export function planTitle(t: PlanType): string {
  return t === 'WEEKLY' ? 'Weekly' : t === 'ANNUAL' ? 'Yearly' : 'Lifetime, pay once';
}

/** Whole percent saved by paying yearly instead of 52 weeks, or null when it is not a saving. */
export function yearlySavingPct(weeklyPrice: number, yearlyPrice: number): number | null {
  if (!(weeklyPrice > 0) || !(yearlyPrice > 0)) return null;
  const pct = Math.floor((1 - yearlyPrice / (weeklyPrice * 52)) * 100);
  return pct > 0 ? pct : null;
}

/**
 * The always-visible 3.1.2(c) disclosure, from the prices StoreKit returned.
 * `trial` is "3 days free" or null.
 */
export function disclosureText(p: { weekly?: string | null; yearly?: string | null; lifetime?: string | null; trial?: string | null }): string {
  const parts: string[] = [];
  if (p.yearly) parts.push(`Yearly ${p.yearly}/year is an auto-renewing subscription billed once a year until cancelled.`);
  if (p.weekly)
    parts.push(
      `Weekly ${p.weekly}/week is an auto-renewing subscription billed once a week until cancelled${
        p.trial ? `; it starts with ${p.trial} and you are not charged until the trial ends` : ''
      }.`
    );
  if (p.lifetime) parts.push(`Lifetime ${p.lifetime} is a one-time purchase, not a subscription.`);
  const head = parts.length > 0 ? parts.join(' ') : 'Pro is offered as a weekly or yearly auto-renewing subscription, or a one-time lifetime purchase.';
  return `${head} Payment is charged to your Apple ID. Cancel a subscription anytime in your Apple ID settings at least 24 hours before the period ends.`;
}
