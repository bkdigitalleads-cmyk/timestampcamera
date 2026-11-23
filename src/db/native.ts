/**
 * The app's database: one SQLite file in the app's own storage
 * (timestampcamera.db), opened once, migrated before anything reads it.
 */
import * as SQLite from 'expo-sqlite';
import { Db, migrate } from './schema';

let opening: Promise<Db> | null = null;

async function open(): Promise<Db> {
  const sq = await SQLite.openDatabaseAsync('timestampcamera.db');
  await sq.execAsync('PRAGMA journal_mode = WAL;');
  const db: Db = {
    exec: (sql) => sq.execAsync(sql),
    run: async (sql, params = []) => {
      await sq.runAsync(sql, params);
    },
    all: <T,>(sql: string, params: (string | number | null)[] = []) => sq.getAllAsync<T>(sql, params),
    get: async <T,>(sql: string, params: (string | number | null)[] = []) => (await sq.getFirstAsync<T>(sql, params)) ?? null,
    // Not the exclusive kind: the queries inside go through this same connection.
    tx: (fn) => sq.withTransactionAsync(fn),
  };
  await migrate(db);
  return db;
}

/** The database, opened and migrated on first use. */
export function getDb(): Promise<Db> {
  if (!opening) {
    opening = open().catch((e) => {
      opening = null;
      throw e;
    });
  }
  return opening;
}
