/**
 * Reading and writing the database through the Db interface. No native
 * imports: the app passes expo-sqlite, the tests pass node:sqlite, and the
 * same SQL runs on both.
 */
import type { Db } from './schema.ts';
import type { Job, Photo, PhotoStamp, PunchItem, PunchStatus, Role } from '../model.ts';

// ---------- key/value ----------

export async function kvGet(db: Db, key: string): Promise<string | null> {
  const r = await db.get<{ value: string }>('SELECT value FROM kv WHERE key = ?', [key]);
  return r ? r.value : null;
}

export async function kvSet(db: Db, key: string, value: string): Promise<void> {
  await db.run('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);
}

export async function kvDelete(db: Db, key: string): Promise<void> {
  await db.run('DELETE FROM kv WHERE key = ?', [key]);
}

// ---------- jobs ----------

type JobRow = { id: string; name: string; address: string; client: string; notes: string; created_at: number; updated_at: number };
const toJob = (r: JobRow): Job => ({ id: r.id, name: r.name, address: r.address, client: r.client, notes: r.notes, createdAt: r.created_at, updatedAt: r.updated_at });

export interface JobListRow extends Job {
  photoCount: number;
  lastPhotoAt: number | null;
  /** The newest photo's small copy, for the list. */
  lastThumb: string | null;
  openItems: number;
}

/** Jobs, the one with the newest photo (or newest change) first. */
export async function listJobs(db: Db): Promise<JobListRow[]> {
  const rows = await db.all<JobRow & { photo_count: number; last_at: number | null; last_thumb: string | null; open_items: number }>(
    `SELECT j.*,
      (SELECT COUNT(*) FROM photos p WHERE p.job_id = j.id) AS photo_count,
      (SELECT MAX(taken_at) FROM photos p WHERE p.job_id = j.id) AS last_at,
      (SELECT thumb FROM photos p WHERE p.job_id = j.id ORDER BY taken_at DESC, created_at DESC LIMIT 1) AS last_thumb,
      (SELECT COUNT(*) FROM punch_items i WHERE i.job_id = j.id AND i.status = 'open') AS open_items
     FROM jobs j`
  );
  return rows
    .map((r) => ({ ...toJob(r), photoCount: Number(r.photo_count), lastPhotoAt: r.last_at == null ? null : Number(r.last_at), lastThumb: r.last_thumb, openItems: Number(r.open_items) }))
    .sort((a, b) => Math.max(b.lastPhotoAt ?? 0, b.updatedAt) - Math.max(a.lastPhotoAt ?? 0, a.updatedAt));
}

export async function getJob(db: Db, id: string): Promise<Job | null> {
  const r = await db.get<JobRow>('SELECT * FROM jobs WHERE id = ?', [id]);
  return r ? toJob(r) : null;
}

export async function countJobs(db: Db): Promise<number> {
  return Number((await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM jobs'))?.n ?? 0);
}

export async function saveJob(db: Db, j: Job): Promise<void> {
  await db.run(
    `INSERT INTO jobs (id, name, address, client, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, address = excluded.address, client = excluded.client, notes = excluded.notes, updated_at = excluded.updated_at`,
    [j.id, j.name.trim(), j.address.trim(), j.client.trim(), j.notes, j.createdAt, j.updatedAt]
  );
}

/** Deletes a job with its photos and punch list. Returns the files to remove from disk. */
export async function deleteJob(db: Db, id: string): Promise<string[]> {
  const files = await db.all<{ file: string; original: string; thumb: string }>('SELECT file, original, thumb FROM photos WHERE job_id = ?', [id]);
  await db.tx(async () => {
    await db.run('DELETE FROM photos WHERE job_id = ?', [id]);
    await db.run('DELETE FROM punch_items WHERE job_id = ?', [id]);
    await db.run('DELETE FROM jobs WHERE id = ?', [id]);
  });
  return files.flatMap((f) => [f.file, f.original, f.thumb]);
}

// ---------- photos ----------

type PhotoRow = {
  id: string;
  job_id: string;
  taken_at: number;
  file: string;
  original: string;
  thumb: string;
  width: number;
  height: number;
  lat: number | null;
  lng: number | null;
  altitude: number | null;
  address: string | null;
  note: string;
  caption: string;
  imported: number;
  role: string | null;
  pair_id: string | null;
  item_id: string | null;
  stamp: string | null;
  created_at: number;
};

function parseStampJson(s: string | null): PhotoStamp | null {
  if (!s) return null;
  try {
    const v = JSON.parse(s);
    return v && typeof v === 'object' && Array.isArray(v.lines) ? (v as PhotoStamp) : null;
  } catch {
    return null;
  }
}

const toPhoto = (r: PhotoRow): Photo => ({
  id: r.id,
  jobId: r.job_id,
  takenAt: Number(r.taken_at),
  file: r.file,
  original: r.original,
  thumb: r.thumb,
  width: Number(r.width),
  height: Number(r.height),
  lat: r.lat,
  lng: r.lng,
  altitude: r.altitude,
  address: r.address,
  note: r.note,
  caption: r.caption,
  imported: r.imported === 1,
  role: r.role === 'before' || r.role === 'after' ? r.role : null,
  pairId: r.pair_id,
  itemId: r.item_id,
  stamp: parseStampJson(r.stamp),
  createdAt: Number(r.created_at),
});

/** A job's photos, oldest first (the order they were taken). */
export async function listPhotos(db: Db, jobId: string): Promise<Photo[]> {
  return (await db.all<PhotoRow>('SELECT * FROM photos WHERE job_id = ? ORDER BY taken_at, created_at', [jobId])).map(toPhoto);
}

export async function getPhoto(db: Db, id: string): Promise<Photo | null> {
  const r = await db.get<PhotoRow>('SELECT * FROM photos WHERE id = ?', [id]);
  return r ? toPhoto(r) : null;
}

export async function countPhotos(db: Db): Promise<number> {
  return Number((await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM photos'))?.n ?? 0);
}

export async function savePhoto(db: Db, p: Photo): Promise<void> {
  await db.run(
    `INSERT INTO photos (id, job_id, taken_at, file, original, thumb, width, height, lat, lng, altitude, address, note, caption, imported, role, pair_id, item_id, stamp, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET job_id = excluded.job_id, taken_at = excluded.taken_at, file = excluded.file, original = excluded.original, thumb = excluded.thumb,
       width = excluded.width, height = excluded.height, lat = excluded.lat, lng = excluded.lng, altitude = excluded.altitude, address = excluded.address,
       note = excluded.note, caption = excluded.caption, imported = excluded.imported, role = excluded.role, pair_id = excluded.pair_id, item_id = excluded.item_id, stamp = excluded.stamp`,
    [p.id, p.jobId, p.takenAt, p.file, p.original, p.thumb, p.width, p.height, p.lat, p.lng, p.altitude, p.address, p.note, p.caption, p.imported ? 1 : 0, p.role, p.pairId, p.itemId, p.stamp ? JSON.stringify(p.stamp) : null, p.createdAt]
  );
}

/**
 * Marks a photo Before, After or neither. Taking the mark off a Before
 * unpairs its After; taking it off an After drops its pair.
 */
export async function setRole(db: Db, id: string, role: Role, pairId: string | null = null): Promise<void> {
  await db.tx(async () => {
    const cur = await getPhoto(db, id);
    if (!cur) return;
    if (cur.role === 'before' && role !== 'before') await db.run("UPDATE photos SET role = NULL, pair_id = NULL WHERE pair_id = ? AND role = 'after'", [id]);
    await db.run('UPDATE photos SET role = ?, pair_id = ? WHERE id = ?', [role, role === 'after' ? pairId : null, id]);
  });
}

/** Deletes a photo. An After that paired with it loses its pair. Returns the files to remove. */
export async function deletePhoto(db: Db, id: string): Promise<string[]> {
  const p = await getPhoto(db, id);
  if (!p) return [];
  await db.tx(async () => {
    await db.run("UPDATE photos SET role = NULL, pair_id = NULL WHERE pair_id = ? AND role = 'after'", [id]);
    await db.run('DELETE FROM photos WHERE id = ?', [id]);
  });
  return [p.file, p.original, p.thumb];
}

// ---------- punch list ----------

type ItemRow = { id: string; job_id: string; position: number; title: string; note: string; status: string; done_at: number | null; created_at: number; updated_at: number };
const toItem = (r: ItemRow): PunchItem => ({
  id: r.id,
  jobId: r.job_id,
  position: Number(r.position),
  title: r.title,
  note: r.note,
  status: (r.status === 'done' ? 'done' : 'open') as PunchStatus,
  doneAt: r.done_at == null ? null : Number(r.done_at),
  createdAt: Number(r.created_at),
  updatedAt: Number(r.updated_at),
});

export async function listItems(db: Db, jobId: string): Promise<PunchItem[]> {
  return (await db.all<ItemRow>('SELECT * FROM punch_items WHERE job_id = ? ORDER BY position, created_at', [jobId])).map(toItem);
}

export async function saveItem(db: Db, i: PunchItem): Promise<void> {
  await db.run(
    `INSERT INTO punch_items (id, job_id, position, title, note, status, done_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET position = excluded.position, title = excluded.title, note = excluded.note, status = excluded.status, done_at = excluded.done_at, updated_at = excluded.updated_at`,
    [i.id, i.jobId, i.position, i.title.trim(), i.note, i.status, i.doneAt, i.createdAt, i.updatedAt]
  );
}

/** Deletes an item. Its photos stay in the job, no longer tied to it. */
export async function deleteItem(db: Db, id: string): Promise<void> {
  await db.tx(async () => {
    await db.run('UPDATE photos SET item_id = NULL WHERE item_id = ?', [id]);
    await db.run('DELETE FROM punch_items WHERE id = ?', [id]);
  });
}
