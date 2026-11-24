import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { useTheme, UI_FONT_FILES, space, type } from './src/theme';
import { AppProvider, useApp, ONBOARDED_KEY } from './src/state';
import { kvGet, kvSet, sweepCache } from './src/store';
import { afterOnboardingPaywall, launchReviewDue } from './src/rules';
import { maybeRequestReview } from './src/reviews';
import { dayKey } from './src/jobs';
import { PRIVACY_URL } from './src/links';
import { DataProvider, useData } from './src/data';
import type { Photo } from './src/model';
import Camera, { CameraMode } from './src/screens/Camera';
import StampEditor from './src/screens/StampEditor';
import Job, { Jobs, JobTab } from './src/screens/Job';
import PhotoView from './src/screens/PhotoView';
import Report from './src/screens/Report';
import Settings from './src/screens/Settings';
import PaywallModal from './src/screens/Paywall';
import Intro, { Permissions, StampShow, TrialSteps } from './src/screens/Intro';
import { GoButton, Sheet, Toast } from './src/ui/Site';

/** A screen over the camera. Back pops one. */
type Over = { name: 'jobs' } | { name: 'job'; id: string; tab?: JobTab } | { name: 'photo'; id: string; ids?: string[] } | { name: 'report'; jobId: string } | { name: 'stamp' } | { name: 'settings' };

function Shell() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { ready, notice, isPro, askPro, paywall } = useApp();
  const data = useData();
  const [stack, setStack] = useState<Over[]>([]);
  const [mode, setMode] = useState<CameraMode>({ kind: 'photo' });
  const push = (o: Over) => setStack((s) => [...s, o]);
  const pop = () => setStack((s) => s.slice(0, -1));
  const toCamera = (m: CameraMode = { kind: 'photo' }) => {
    setMode(m);
    setStack([]);
  };
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  // New installs: three screens, the permissions, the trial and reminder screens, then the paywall.
  const [step, setStep] = useState<'intro' | 'perms' | 'trial' | 'paywall'>('intro');
  const [claim, setClaim] = useState(false);
  const paywallOpened = useRef(false);
  const launchAsked = useRef(false);

  useEffect(() => {
    sweepCache();
  }, []);

  useEffect(() => {
    if (!ready || !data.loaded || onboarded !== null) return;
    (async () => {
      if ((await kvGet(ONBOARDED_KEY)) === '1') return setOnboarded(true);
      // Anyone who already has photos, or Pro, has used the app: no onboarding.
      if (isPro || data.photoTotal > 0) {
        kvSet(ONBOARDED_KEY, '1').catch(() => {});
        return setOnboarded(true);
      }
      setOnboarded(false);
    })().catch(() => setOnboarded(true)); // fail open: never trap anyone
  }, [ready, data.loaded, onboarded, isPro, data.photoTotal]);

  // The later-day rating ask waits until the person leaves the camera (never over the viewfinder).
  useEffect(() => {
    if (!onboarded || stack.length === 0 || launchAsked.current) return;
    launchAsked.current = true;
    if (launchReviewDue({ photoCount: data.photoTotal, firstDay: data.firstDay, today: dayKey(Date.now()) })) maybeRequestReview('tenPhotos');
  }, [onboarded, stack.length, data.photoTotal, data.firstDay]);

  const openOnboardingPaywall = () => {
    if (paywallOpened.current) return;
    paywallOpened.current = true;
    setStep('paywall');
    askPro('pro').then((pro) => {
      if (afterOnboardingPaywall(pro) === 'claim') setTimeout(() => setClaim(true), 450);
      kvSet(ONBOARDED_KEY, '1').catch(() => {});
      setOnboarded(true);
    });
  };

  if (!ready || !data.loaded || onboarded === null) return <View style={{ flex: 1, backgroundColor: theme.chrome }} />;
  if (data.failed) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, padding: space.l, paddingTop: insets.top + space.xxl }}>
        <Text style={[type.title, { color: theme.ink }]}>Your photos did not open.</Text>
        <Text style={[type.body, { color: theme.inkSoft, marginTop: space.s }]}>Close the app and open it again. If it keeps happening, write to support from the App Store page. ({data.failed})</Text>
      </View>
    );
  }

  if (!onboarded) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, paddingTop: insets.top }}>
        <StatusBar style="dark" />
        {step === 'intro' && <Intro onDone={() => setStep('perms')} />}
        {step === 'perms' && <Permissions onDone={() => setStep('trial')} />}
        {(step === 'trial' || step === 'paywall') && <TrialSteps onDone={openOnboardingPaywall} />}
        <PaywallModal privacyUrl={PRIVACY_URL} onboarding hero={<View style={{ alignItems: 'center' }}><StampShow width={150} height={160} /></View>} />
      </View>
    );
  }

  const top = stack[stack.length - 1];
  const takeAfter = (before: Photo) => toCamera({ kind: 'after', before });
  let over: React.ReactNode = null;
  if (top?.name === 'jobs') over = <Jobs onBack={pop} onOpen={(id) => push({ name: 'job', id })} />;
  else if (top?.name === 'job')
    over = <Job key={top.id} id={top.id} tab={top.tab} onBack={pop} onPhoto={(id, ids) => push({ name: 'photo', id, ids })} onTakeAfter={takeAfter} onShootItem={(item) => toCamera({ kind: 'item', item })} onReport={(jobId) => push({ name: 'report', jobId })} onCamera={() => toCamera()} />;
  else if (top?.name === 'photo') over = <PhotoView key={top.id} id={top.id} ids={top.ids} onBack={pop} onTakeAfter={takeAfter} onPhoto={(id) => push({ name: 'photo', id })} />;
  else if (top?.name === 'report') over = <Report key={top.jobId} jobId={top.jobId} onBack={pop} />;
  else if (top?.name === 'stamp') over = <StampEditor onBack={pop} />;
  else if (top?.name === 'settings')
    over = (
      <Settings
        onBack={pop}
        onStamp={() => push({ name: 'stamp' })}
        onReplayOnboarding={() => {
          paywallOpened.current = false;
          setStack([]);
          setStep('intro');
          setOnboarded(false);
        }}
      />
    );

  return (
    <View style={{ flex: 1, backgroundColor: theme.chrome }}>
      <StatusBar style={over ? 'dark' : 'light'} />
      <Camera
        active={!over && paywall == null && !claim}
        mode={mode}
        onExitMode={() => setMode({ kind: 'photo' })}
        onOpenJob={(id) => push({ name: 'job', id })}
        onOpenJobs={() => push({ name: 'jobs' })}
        onSettings={() => push({ name: 'settings' })}
        onStamp={() => push({ name: 'stamp' })}
      />
      {over ? <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: theme.bg, paddingTop: insets.top }}>{over}</View> : null}
      <Toast theme={theme} text={notice} top={insets.top + 56} dark={!over} />
      <PaywallModal privacyUrl={PRIVACY_URL} />
      <Sheet theme={theme} visible={claim} onClose={() => setClaim(false)} title="Free, for good">
        <Text style={[type.body, { color: theme.ink }]}>The camera, every stamp line, one job, saving to Photos and your first photo report.</Text>
        <Text style={[type.body, { color: theme.inkSoft, marginTop: space.s, marginBottom: space.xl }]}>No watermark on free photos.</Text>
        <GoButton theme={theme} label="Open the camera" onPress={() => setClaim(false)} />
      </Sheet>
    </View>
  );
}

/** A failure while a screen renders: shown instead of a frozen screen. Nothing is lost on disk. */
class Guard extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <View style={{ flex: 1, backgroundColor: '#F3F4F1', padding: space.l, paddingTop: 80 }}>
        <Text style={[type.title, { color: '#15181B' }]}>Something went wrong on this screen.</Text>
        <Text style={[type.body, { color: '#15181B', marginTop: space.s }]}>Close the app and open it again. Your photos are saved.</Text>
        <Text style={{ fontSize: 12, color: '#868C92', marginTop: space.l }}>{error.message}</Text>
      </View>
    );
  }
}

export default function App() {
  const theme = useTheme();
  const [fontsLoaded, fontError] = useFonts({ ...UI_FONT_FILES });
  // If the fonts are still not in after a few seconds, open anyway with the system font.
  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setGaveUp(true), 6000);
    return () => clearTimeout(t);
  }, []);
  // The camera chrome while fonts load, so launch never flashes white.
  if (!fontsLoaded && !fontError && !gaveUp) return <View style={{ flex: 1, backgroundColor: theme.chrome }} />;
  return (
    <Guard>
      <SafeAreaProvider>
        <AppProvider>
          <DataProvider>
            <Shell />
          </DataProvider>
        </AppProvider>
      </SafeAreaProvider>
    </Guard>
  );
}
