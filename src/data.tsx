/**
 * The app's data for the screens: the jobs, the current job, the stamp
 * settings, the company name and logo, and the reads and writes on photos
 * and punch list items. Everything goes through src/db/repo.ts on the one
 * SQLite database; `version` moves on every change so open screens reload.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getLocales } from 'expo-localization';
import { getDb } from './db/native';
import * as repo from './db/repo';
import type { JobListRow } from './db/repo';
import type { Job, Photo, PunchItem, Role } from './model';
import { newId } from './model';
import { defaultStamp, parseStamp, StampSettings } from './stamp/content';
import { regionDefaults } from './stamp/format';
import { KEYS, Logo, paperFor, parseLogo } from './settings';
import { removeRel } from './store';
import { dayKey, nextJobName } from './jobs';
import type { Paper } from './pdf/ops';

interface Data {
  loaded: boolean;
  failed: string | null;
  version: number;
  jobs: JobListRow[];
  currentJobId: string | null;
  currentJob: JobListRow | null;
  setCurrentJob: (id: string) => Promise<void>;
  /** A new job; becomes the current one. The caller checks the gate first. */
  createJob: (fields?: Partial<Pick<Job, 'name' | 'address' | 'client' | 'notes'>>) => Promise<Job>;
  saveJob: (j: Job) => Promise<void>;
  deleteJob: (id: string) => Promise<void>;
  getJob: (id: string) => Promise<Job | null>;
  photos: (jobId: string) => Promise<Photo[]>;
  getPhoto: (id: string) => Promise<Photo | null>;
  savePhoto: (p: Photo) => Promise<void>;
  deletePhoto: (id: string) => Promise<void>;
  setRole: (id: string, role: Role, pairId?: string | null) => Promise<void>;
  items: (jobId: string) => Promise<PunchItem[]>;
  saveItem: (i: PunchItem) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  photoTotal: number;
  stamp: StampSettings;
  saveStamp: (s: StampSettings) => Promise<void>;
  company: string;
  saveCompany: (name: string) => Promise<void>;
  logo: Logo | null;
  saveLogo: (l: Logo | null) => Promise<void>;
  saveToPhotos: boolean;
  setSaveToPhotos: (v: boolean) => Promise<void>;
  firstDay: string | null;
  region: string | null;
  paper: Paper;
  kvGet: (k: string) => Promise<string | null>;
  kvSet: (k: string, v: string) => Promise<void>;
}

const Ctx = createContext<Data | null>(null);

function region(): string | null {
  try {
    return getLocales()[0]?.regionCode ?? null;
  } catch {
    return null;
  }
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const reg = useMemo(region, []);
  const fallbackStamp = useMemo(() => defaultStamp(regionDefaults(reg)), [reg]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [jobs, setJobs] = useState<JobListRow[]>([]);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [photoTotal, setPhotoTotal] = useState(0);
  const [stamp, setStamp] = useState<StampSettings>(fallbackStamp);
  const [company, setCompany] = useState('');
  const [logo, setLogo] = useState<Logo | null>(null);
  const [saveToPhotos, setSave] = useState(false);
  const [firstDay, setFirstDay] = useState<string | null>(null);

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const reload = useCallback(async () => {
    const db = await getDb();
    setJobs(await repo.listJobs(db));
    setPhotoTotal(await repo.countPhotos(db));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const db = await getDb();
        setStamp(parseStamp(await repo.kvGet(db, KEYS.stamp), fallbackStamp));
        setCompany((await repo.kvGet(db, KEYS.company)) ?? '');
        setLogo(parseLogo(await repo.kvGet(db, KEYS.logo)));
        setSave((await repo.kvGet(db, KEYS.saveToPhotos)) === '1');
        setCurrentJobId(await repo.kvGet(db, KEYS.currentJob));
        let fd = await repo.kvGet(db, KEYS.firstDay);
        if (!fd) {
          fd = dayKey(Date.now());
          await repo.kvSet(db, KEYS.firstDay, fd);
        }
        setFirstDay(fd);
        await reload();
      } catch (e: any) {
        setFailed(e?.message ?? 'unknown');
      }
      setLoaded(true);
    })();
  }, [fallbackStamp, reload]);

  const after = useCallback(async () => {
    await reload();
    bump();
  }, [reload, bump]);

  const value = useMemo<Data>(() => {
    const currentJob = jobs.find((j) => j.id === currentJobId) ?? jobs[0] ?? null;
    const kv = async (k: string, v: string) => repo.kvSet(await getDb(), k, v);
    return {
      loaded,
      failed,
      version,
      jobs,
      currentJobId: currentJob?.id ?? null,
      currentJob,
      setCurrentJob: async (id) => {
        setCurrentJobId(id);
        await kv(KEYS.currentJob, id);
      },
      createJob: async (fields = {}) => {
        const now = Date.now();
        const j: Job = { id: newId(now), name: (fields.name ?? '').trim() || nextJobName(jobs), address: fields.address ?? '', client: fields.client ?? '', notes: fields.notes ?? '', createdAt: now, updatedAt: now };
        await repo.saveJob(await getDb(), j);
        setCurrentJobId(j.id);
        await kv(KEYS.currentJob, j.id);
        await after();
        return j;
      },
      saveJob: async (j) => {
        await repo.saveJob(await getDb(), { ...j, updatedAt: Date.now() });
        await after();
      },
      deleteJob: async (id) => {
        removeRel(await repo.deleteJob(await getDb(), id));
        await after();
      },
      getJob: async (id) => repo.getJob(await getDb(), id),
      photos: async (jobId) => repo.listPhotos(await getDb(), jobId),
      getPhoto: async (id) => repo.getPhoto(await getDb(), id),
      savePhoto: async (p) => {
        await repo.savePhoto(await getDb(), p);
        await after();
      },
      deletePhoto: async (id) => {
        removeRel(await repo.deletePhoto(await getDb(), id));
        await after();
      },
      setRole: async (id, role, pairId = null) => {
        await repo.setRole(await getDb(), id, role, pairId);
        await after();
      },
      items: async (jobId) => repo.listItems(await getDb(), jobId),
      saveItem: async (i) => {
        await repo.saveItem(await getDb(), i);
        await after();
      },
      deleteItem: async (id) => {
        await repo.deleteItem(await getDb(), id);
        await after();
      },
      photoTotal,
      stamp,
      saveStamp: async (s) => {
        setStamp(s);
        await kv(KEYS.stamp, JSON.stringify(s));
      },
      company,
      saveCompany: async (name) => {
        setCompany(name.trim());
        await kv(KEYS.company, name.trim());
      },
      logo,
      saveLogo: async (l) => {
        if (logo && (!l || l.file !== logo.file)) removeRel([logo.file]);
        setLogo(l);
        await kv(KEYS.logo, l ? JSON.stringify(l) : 'null');
      },
      saveToPhotos,
      setSaveToPhotos: async (v) => {
        setSave(v);
        await kv(KEYS.saveToPhotos, v ? '1' : '0');
      },
      firstDay,
      region: reg,
      paper: paperFor(reg),
      kvGet: async (k) => repo.kvGet(await getDb(), k),
      kvSet: kv,
    };
  }, [loaded, failed, version, jobs, currentJobId, photoTotal, stamp, company, logo, saveToPhotos, firstDay, reg, after]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData(): Data {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useData must be used inside DataProvider');
  return ctx;
}
