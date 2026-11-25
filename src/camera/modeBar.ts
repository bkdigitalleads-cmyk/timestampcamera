/**
 * The camera's two modes besides plain photos: photos for a punch list item,
 * and the After for a Before. While one is on, the job bar is fixed to that
 * item's or that Before's job. Pure, so tests/camera.test.mjs checks it.
 *
 * Build 4 on Brian's phone: after "Photo for: Fix floorboard" he could not get
 * back to choosing a job. The banner's only way out was a bare X, and the job
 * bar did nothing when tapped. Now the banner has a labelled button, and a tap
 * on the job bar says how to finish. The tap does not leave the mode by
 * itself: a tap by mistake would quietly send the next photos to the job
 * instead of the item.
 */

export type ModeKind = 'photo' | 'after' | 'item';

/**
 * The banner's button. Done for item photos (as many as needed, then Done).
 * Cancel for the After: the mode ends by itself once the After is taken, so
 * the button is only for not taking it.
 */
export function modeEndLabel(kind: ModeKind): string | null {
  if (kind === 'item') return 'Done';
  if (kind === 'after') return 'Cancel';
  return null;
}

/** What a tap on the job bar says while it is fixed to the mode's job. Null: the bar opens the Jobs sheet. */
export function lockedJobBarLine(kind: ModeKind, itemTitle = ''): string | null {
  if (kind === 'item') return `Photos now go on ${itemTitle ? `"${itemTitle}"` : 'this punch list item'}. Tap Done to pick a job.`;
  if (kind === 'after') return 'The next photo is the After for that Before. Tap Cancel to pick a job.';
  return null;
}
