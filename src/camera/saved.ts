/**
 * The copy to Photos after a photo is saved, and what the banner says about it.
 * Pure, so tests/camera.test.mjs checks exactly what the app runs.
 *
 * Build 3 on Brian's phone: every copy failed. The cause was not the
 * permission or timing: expo-media-library 57 moved saveToLibraryAsync to
 * "expo-media-library/legacy" and the one still exported from the package
 * root throws on every call. Our catch turned that into "Photos did not take
 * a copy." src/capture.ts now imports the legacy API, and a failed copy is
 * tried once more, quietly, before the person is told.
 */
import type { Role } from '../model.ts';

/** copied; no-access: Photos access for adding is off; failed: Photos said no for another reason. */
export type CopyResult = 'copied' | 'no-access' | 'failed';

/** How long to wait before the one quiet retry. */
export const COPY_RETRY_MS = 1500;

export interface CopyIO {
  /** True when the app may add photos (add-only access, or full access). */
  allowed: () => Promise<boolean>;
  save: () => Promise<void>;
  wait: (ms: number) => Promise<void>;
}

/** Tries the copy, and once more after a short wait if Photos refused it. */
export async function copyWithRetry(io: CopyIO): Promise<CopyResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    let ok = false;
    try {
      ok = await io.allowed();
    } catch {
      ok = true; // could not read the setting: let the save itself answer
    }
    if (!ok) return 'no-access';
    try {
      await io.save();
      return 'copied';
    } catch {
      if (attempt === 0) await io.wait(COPY_RETRY_MS);
    }
  }
  return 'failed';
}

/** Where to turn adding to Photos back on, in the words iOS uses. */
export const PHOTOS_ACCESS_HELP = 'To fix it: Settings, Privacy and Security, Photos, Timestamp Cam, Add Photos Only.';

/** The banner after a camera photo is saved. `copy` is null when saving to Photos is off. */
export function savedBanner(role: Role, job: string, copy: CopyResult | null): string {
  const head = `${role === 'after' ? 'After saved to' : role === 'before' ? 'Before saved to' : 'Saved to'} ${job}`;
  if (copy === 'no-access') return `${head}. Photos did not take a copy. ${PHOTOS_ACCESS_HELP}`;
  if (copy === 'failed') return `${head}. Photos did not take a copy.`;
  return head;
}
