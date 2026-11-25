import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState as RNAppState } from 'react-native';
import { initPurchases, getIsPro, checkPro, onProChange } from './purchases';
import { syncTrialReminder } from './reminder';
import { hasSandboxPro } from './testing';
import { setReviewGuard } from './reviews';
import { kvGet, kvSet } from './store';
import { FreeReports, parseFreeReports, PaywallReason, recordFreeReport } from './gates';

export const ONBOARDED_KEY = 'flag.onboarded';
const FREE_REPORTS_KEY = 'usage.freeReports';
/** Test builds only: Pro is ignored on this phone while this is on. */
const ACT_FREE_KEY = 'test.actFree';

interface AppState {
  ready: boolean;
  isPro: boolean;
  setIsPro: (v: boolean) => void;
  testBuild: boolean;
  actFree: boolean;
  setActFree: (v: boolean) => Promise<void>;
  /** Why the in-app paywall is open, or null. */
  paywall: PaywallReason | null;
  /** Opens the paywall; resolves with whether Pro is on once it closes. */
  askPro: (reason: PaywallReason) => Promise<boolean>;
  hidePaywall: () => void;
  /** The jobs whose report went out free (the first one). */
  freeReports: FreeReports;
  noteFreeReport: (jobId: string) => void;
  resetFreeReports: () => void;
  /** The camera is on screen (no rating prompt then). */
  setCameraOpen: (v: boolean) => void;
  notice: string | null;
  say: (text: string) => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [storePro, setStorePro] = useState(false);
  const [sandbox, setSandbox] = useState(false);
  const [actFree, setActFreeState] = useState(false);
  const [paywall, setPaywall] = useState<PaywallReason | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const [freeReports, setFreeReports] = useState<FreeReports>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraRef = useRef(true);

  const say = useCallback((text: string) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice(text);
    // Longer notes (what to change in Settings) stay up long enough to read.
    noticeTimer.current = setTimeout(() => setNotice(null), Math.min(8000, Math.max(3200, text.length * 55)));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setFreeReports(parseFreeReports(await kvGet(FREE_REPORTS_KEY)));
        setActFreeState((await kvGet(ACT_FREE_KEY)) === '1');
      } catch {
        // unreadable storage -> defaults
      }
      try {
        await initPurchases();
        setStorePro(await getIsPro());
        setSandbox(await hasSandboxPro());
      } catch {
        setStorePro(false);
      }
      setReady(true);
    })();
  }, []);

  // Keep Pro in step with the store without a relaunch (renewals, expiries,
  // refunds), and re-check after a real trip to the background. The same
  // foreground check drops the trial reminder once the trial is over.
  useEffect(() => {
    if (!ready) return;
    syncTrialReminder();
    const unsubscribe = onProChange((v) => {
      setStorePro(v);
      hasSandboxPro().then(setSandbox);
    });
    let wasBackground = false;
    const sub = RNAppState.addEventListener('change', (s) => {
      if (s === 'background') wasBackground = true;
      if (s !== 'active' || !wasBackground) return;
      wasBackground = false;
      checkPro().then((v) => {
        if (v !== null) setStorePro(v);
      });
      syncTrialReminder();
    });
    return () => {
      unsubscribe();
      sub.remove();
    };
  }, [ready]);

  useEffect(() => setReviewGuard(() => cameraRef.current), []);

  const testBuild = __DEV__ || sandbox;
  const isPro = storePro && !(testBuild && actFree);
  const proRef = useRef(isPro);
  proRef.current = isPro;

  const askPro = useCallback((reason: PaywallReason) => {
    if (proRef.current) return Promise.resolve(true);
    resolver.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setPaywall(reason);
    });
  }, []);

  const hidePaywall = useCallback(() => {
    setPaywall(null);
    const r = resolver.current;
    resolver.current = null;
    // After the purchase sets Pro, on the next tick.
    setTimeout(() => r?.(proRef.current), 0);
  }, []);

  const setIsPro = useCallback(
    (v: boolean) => {
      proRef.current = v && !(testBuild && actFree);
      setStorePro(v);
    },
    [testBuild, actFree]
  );

  const noteFreeReport = useCallback((jobId: string) => {
    setFreeReports((list) => {
      const next = recordFreeReport(list, jobId);
      if (next !== list) kvSet(FREE_REPORTS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const resetFreeReports = useCallback(() => {
    setFreeReports([]);
    kvSet(FREE_REPORTS_KEY, '[]').catch(() => {});
  }, []);

  const setActFree = useCallback(
    async (v: boolean) => {
      if (!testBuild) return;
      setActFreeState(v);
      await kvSet(ACT_FREE_KEY, v ? '1' : '0').catch(() => {});
    },
    [testBuild]
  );

  const setCameraOpen = useCallback((v: boolean) => {
    cameraRef.current = v;
  }, []);

  const value = useMemo<AppState>(
    () => ({
      ready,
      isPro,
      setIsPro,
      testBuild,
      actFree: testBuild && actFree,
      setActFree,
      paywall,
      askPro,
      hidePaywall,
      freeReports,
      noteFreeReport,
      resetFreeReports,
      setCameraOpen,
      notice,
      say,
    }),
    [ready, isPro, setIsPro, testBuild, actFree, setActFree, paywall, askPro, hidePaywall, freeReports, noteFreeReport, resetFreeReports, setCameraOpen, notice, say]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
