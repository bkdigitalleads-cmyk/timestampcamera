/**
 * The app's records. Pure, no imports. Every photo belongs to a job; a
 * punch list item belongs to a job and can hold photos; a Before photo can
 * have one After, taken from the same spot.
 */

export interface Job {
  id: string;
  name: string;
  address: string;
  client: string;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export type Role = 'before' | 'after' | null;

/** The stamp exactly as it printed, so it can be corrected from the original later. */
export interface PhotoStamp {
  template: 'compact' | 'standard' | 'full';
  corner: 'bottomLeft' | 'bottomRight' | 'topLeft' | 'topRight';
  size: 'small' | 'medium' | 'large';
  /** The lines that printed, top to bottom. */
  lines: string[];
  logo: boolean;
  map: boolean;
  /** Printed without a date and time (an imported file that had none). */
  noTime?: boolean;
}

export interface Photo {
  id: string;
  jobId: string;
  /** When it was taken (the camera's clock, or the imported file's own date). */
  takenAt: number;
  /** Files under the app's documents folder, as relative paths: the stamped photo, the original, a small copy. */
  file: string;
  original: string;
  thumb: string;
  width: number;
  height: number;
  lat: number | null;
  lng: number | null;
  altitude: number | null;
  address: string | null;
  /** The free note that printed on the stamp. */
  note: string;
  /** A caption for the report, never printed on the photo. */
  caption: string;
  /** Came from the library, not this camera. Shown in the app's own list only. */
  imported: boolean;
  role: Role;
  /** On an After: the Before it pairs with. */
  pairId: string | null;
  /** The punch list item it belongs to, if any. */
  itemId: string | null;
  stamp: PhotoStamp | null;
  createdAt: number;
}

export type PunchStatus = 'open' | 'done';

export interface PunchItem {
  id: string;
  jobId: string;
  position: number;
  title: string;
  note: string;
  status: PunchStatus;
  doneAt: number | null;
  createdAt: number;
  updatedAt: number;
}

/** A sortable, unique enough id: time in base 36 and six random characters. */
export function newId(now: number, rand: () => number = Math.random): string {
  return `${now.toString(36)}${Math.floor(rand() * 36 ** 6)
    .toString(36)
    .padStart(6, '0')}`;
}

/** A job's name for the chip and the stamp: trimmed, never empty. */
export function jobLabel(j: Pick<Job, 'name'> | null | undefined): string {
  const n = (j?.name ?? '').trim();
  return n || 'Untitled job';
}
