/**
 * Storage on the phone. Jobs, photos' records, the punch list and settings
 * live in SQLite (src/db, one file, timestampcamera.db). The photo files
 * live in the app's own documents folder, under photos/<job id>/, and the
 * database keeps their paths relative to that folder (iOS can move the
 * app's folder between updates; a relative path still finds the file).
 * Share copies (reports, pairs) go to the cache and are cleared at the next
 * launch. Nothing here talks to a network.
 */
import { Directory, File, Paths } from 'expo-file-system';
import { getDb } from './db/native';
import * as repo from './db/repo';

// ---------- key/value (the kv table in SQLite) ----------

export async function kvGet(key: string): Promise<string | null> {
  return repo.kvGet(await getDb(), key);
}

export async function kvSet(key: string, value: string): Promise<void> {
  await repo.kvSet(await getDb(), key, value);
}

// ---------- photo files ----------

/** The file for a relative path such as "photos/abc/xyz.jpg". */
export function fileAt(rel: string): File {
  return new File(Paths.document, rel);
}

/** A file:// uri for a relative path, for <Image> and the share sheet. */
export function uriOf(rel: string): string {
  return fileAt(rel).uri;
}

/** Writes bytes at a relative path, making its folders. */
export function writeRel(rel: string, bytes: Uint8Array): void {
  const parts = rel.split('/');
  parts.pop();
  if (parts.length) {
    const d = new Directory(Paths.document, parts.join('/'));
    if (!d.exists) d.create({ intermediates: true, idempotent: true });
  }
  const f = fileAt(rel);
  if (f.exists) f.delete();
  f.create();
  f.write(bytes);
}

export function readRel(rel: string): Uint8Array {
  return fileAt(rel).bytesSync();
}

export function readUri(uri: string): Uint8Array {
  return new File(uri).bytesSync();
}

/** Removes files by relative path; a missing file is fine. */
export function removeRel(rels: string[]): void {
  for (const r of rels) {
    try {
      const f = fileAt(r);
      if (f.exists) f.delete();
    } catch {
      // already gone
    }
  }
}

// ---------- share copies ----------

function cacheDir(name: string): Directory {
  const d = new Directory(Paths.cache, name);
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
}

/** A file for the share sheet or Print in the cache, under a readable name. */
export function shareFile(name: string, data: Uint8Array): string {
  const d = new Directory(cacheDir('share'), Date.now().toString(36));
  d.create({ intermediates: true, idempotent: true });
  const f = new File(d, name);
  f.create();
  f.write(data);
  return f.uri;
}

/** Clears yesterday's share copies at launch. */
export function sweepCache(): void {
  try {
    const d = new Directory(Paths.cache, 'share');
    if (d.exists) d.delete();
  } catch {
    // harmless
  }
}
