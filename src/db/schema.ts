/**
 * The database layout and its migrations. Pure (no native imports), so
 * `npm test` runs the same migrations on Node's SQLite.
 *
 * Rules: MIGRATIONS only ever grows. A shipped migration is never edited
 * or reordered; a change is a new entry at the end. PRAGMA user_version
 * holds how many have run.
 */

export type Param = string | number | null;

/** The little the app needs from a database: expo-sqlite in the app, node:sqlite in the tests. */
export interface Db {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: Param[]): Promise<void>;
  all<T>(sql: string, params?: Param[]): Promise<T[]>;
  get<T>(sql: string, params?: Param[]): Promise<T | null>;
  /** Runs fn inside one transaction: all of it lands, or none of it. */
  tx(fn: () => Promise<void>): Promise<void>;
}

export const MIGRATIONS: string[] = [
  // 1: 1.0.0
  `
  CREATE TABLE kv (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  CREATE TABLE jobs (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    client TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE photos (
    id TEXT PRIMARY KEY NOT NULL,
    job_id TEXT NOT NULL,
    taken_at INTEGER NOT NULL,
    file TEXT NOT NULL,
    original TEXT NOT NULL,
    thumb TEXT NOT NULL,
    width INTEGER NOT NULL DEFAULT 0,
    height INTEGER NOT NULL DEFAULT 0,
    lat REAL,
    lng REAL,
    altitude REAL,
    address TEXT,
    note TEXT NOT NULL DEFAULT '',
    caption TEXT NOT NULL DEFAULT '',
    imported INTEGER NOT NULL DEFAULT 0,
    role TEXT,
    pair_id TEXT,
    item_id TEXT,
    stamp TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX photos_job ON photos (job_id, taken_at);
  CREATE INDEX photos_item ON photos (item_id);
  CREATE TABLE punch_items (
    id TEXT PRIMARY KEY NOT NULL,
    job_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open',
    done_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX punch_job ON punch_items (job_id, position);
  `,
];

/** Runs every migration this database has not had yet, each in its own transaction. Returns the version it ends at. */
export async function migrate(db: Db): Promise<number> {
  const row = await db.get<{ user_version: number }>('PRAGMA user_version');
  let v = Number(row?.user_version ?? 0);
  if (v > MIGRATIONS.length) throw new Error(`This database is from a newer version of the app (${v}).`);
  while (v < MIGRATIONS.length) {
    const sql = MIGRATIONS[v];
    const next = v + 1;
    await db.tx(async () => {
      await db.exec(sql);
      await db.exec(`PRAGMA user_version = ${next}`);
    });
    v = next;
  }
  return v;
}
