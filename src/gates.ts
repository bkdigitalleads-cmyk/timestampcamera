/**
 * What is free and what is Pro, as pure functions checked by `npm test`.
 *
 * Free forever: the camera, every stamp line (date, time, address,
 * coordinates, altitude, note, job name), all templates, corners and sizes,
 * one job, saving to Photos, and correcting a stamp. Free photos carry no
 * extra watermark. The first photo report is free.
 *
 * Pro adds: more jobs, the company name and logo on the stamp, the map
 * thumbnail, before and after pairs, punch lists, photo reports after the
 * first, and stamping photos imported from the library.
 *
 * Nobody is locked out of what they already made: every job, photo, pair
 * and punch list stays readable and shareable when Pro ends, photos can
 * still go into any job that exists, and a job whose report went out free
 * can always send its report again.
 */

export const FREE_JOBS = 1;
export const FREE_REPORTS = 1;

export type ProFeature = 'company' | 'logo' | 'map' | 'pairs' | 'punch' | 'import';

/** Why the in-app paywall opened: a second job, a second report, a locked feature, or Settings. */
export type PaywallReason = 'job' | 'report' | ProFeature | 'pro';

export function featureAllowed(isPro: boolean, _f: ProFeature): boolean {
  return isPro;
}

/** A new job: the first is free, more need Pro. */
export function canAddJob(isPro: boolean, jobCount: number): boolean {
  return isPro || jobCount < FREE_JOBS;
}

/** Taking photos into a job that exists is never gated, with or without Pro. */
export function canShoot(_isPro: boolean): true {
  return true;
}

/** The jobs whose report went out free, by id. */
export type FreeReports = string[];

export interface ReportDecision {
  allowed: boolean;
  /** Sending now uses the free report. */
  usesFree: boolean;
}

export function reportDecision(isPro: boolean, freeReports: FreeReports, jobId: string): ReportDecision {
  if (isPro) return { allowed: true, usesFree: false };
  if (freeReports.includes(jobId)) return { allowed: true, usesFree: false };
  if (freeReports.length < FREE_REPORTS) return { allowed: true, usesFree: true };
  return { allowed: false, usesFree: false };
}

/** Records the free report once (sending the same job's report twice counts once). */
export function recordFreeReport(list: FreeReports, jobId: string): FreeReports {
  return list.includes(jobId) ? list : [...list, jobId];
}

/** The stored list, cleaned: strings only, no repeats. Bad data counts as none used. */
export function parseFreeReports(json: string | null): FreeReports {
  try {
    const v = JSON.parse(json ?? '[]');
    if (!Array.isArray(v)) return [];
    return [...new Set(v.filter((x) => typeof x === 'string' && x.length > 0))];
  } catch {
    return [];
  }
}

/** The paywall's headline and one line, by why it opened. */
export const PAYWALL_COPY: Record<PaywallReason, { title: string; line: string }> = {
  job: { title: 'Keep every job apart.', line: 'Pro gives you as many jobs as you need, each with its own photos, pairs and punch list.' },
  report: { title: 'Send a report for every job.', line: 'Your first photo report was free. Pro builds as many as you need.' },
  company: { title: 'Put your company on every photo.', line: 'Your company name prints on the stamp, under the job.' },
  logo: { title: 'Put your logo on every photo.', line: 'A small logo prints beside the stamp.' },
  map: { title: 'Show the spot on a map.', line: 'A small map of where you stood prints beside the stamp.' },
  pairs: { title: 'Before and after, side by side.', line: 'Line up the After over a faint Before, then send the pair as one image.' },
  punch: { title: 'Run the punch list here.', line: 'Items with photos, ticked off as the work gets done, and in the report.' },
  import: { title: 'Stamp photos you already took.', line: 'Their own date and place go on the stamp when the file has them.' },
  pro: { title: 'Timestamp Camera Pro.', line: 'Unlimited jobs, reports, before and after pairs, punch lists, your logo and company name on the stamp.' },
};
