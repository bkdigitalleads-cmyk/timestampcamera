import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera as ExpoCamera } from 'expo-camera';
import * as Location from 'expo-location';
import { useTheme, radius, space, type, Theme } from '../theme';
import { getOffering } from '../purchases';
import { getTrialEligibleIds, trialLabel } from '../trial';
import { requestReminderPermission } from '../reminder';
import { trialLength } from '../offer';
import { useData } from '../data';
import { askPhotosAccess } from '../capture';
import { defaultStamp, stampLines } from '../stamp/content';
import { regionDefaults } from '../stamp/format';
import StampLayer, { useStampFont } from '../ui/StampLayer';
import Glyph, { GlyphName } from '../ui/Glyph';
import { Card, GoButton, Line, Press, Tag } from '../ui/Site';

const SAMPLE = require('../../assets/sample/site.jpg');

/**
 * First launch, in this order (App.tsx runs it):
 *   1-3. three screens that show the product: the stamp on a photo, photos
 *        filed by job, a photo report
 *   4.   the camera, with its reason
 *   5.   location while using the app, with its reason
 *   6.   saving copies to Photos, asked only if the person turns it on
 *   a.   TrialSteps "Try it free"                      } only when RevenueCat says this
 *   b.   TrialSteps "We'll remind you the day before"  } Apple ID can get the free trial
 *   then the onboarding paywall (close button after 3 seconds).
 * No account, name or email is asked. Every permission can be skipped and
 * the app still works: without location the stamp shows the date and time.
 */
const PAGES: { title: string; line: string; show: 'stamp' | 'jobs' | 'report' }[] = [
  { title: 'Every photo shows when and where it was taken.', line: 'Date, time, address and coordinates, printed into the photo.', show: 'stamp' },
  { title: 'Photos sort themselves by job.', line: 'Pick the job once. Every shot lands there, by day.', show: 'jobs' },
  { title: 'Send a photo report in one tap.', line: 'Photos, before and after, the punch list and a signature, as one PDF.', show: 'report' },
];

interface TrialOffer {
  length: string;
  then: string;
}

let offerPromise: Promise<TrialOffer | null> | null = null;

async function loadTrialOffer(): Promise<TrialOffer | null> {
  const off = await getOffering();
  const pkg = off?.weekly;
  if (!pkg) return null;
  if (!trialLabel(pkg, await getTrialEligibleIds([pkg]))) return null;
  const length = trialLength(pkg.product.introPrice);
  if (!length) return null;
  return { length, then: `${pkg.product.priceString} a week` };
}

/** Starts the eligibility check early; it is ready long before the trial screen. */
function trialOffer(): Promise<TrialOffer | null> {
  if (!offerPromise) offerPromise = loadTrialOffer().catch(() => null);
  return offerPromise;
}

export default function Intro({ onDone }: { onDone: () => void }) {
  const theme = useTheme();
  const [step, setStep] = useState(0);
  useEffect(() => {
    trialOffer();
  }, []);
  const { width, height } = useWindowDimensions();
  const next = () => (step < PAGES.length - 1 ? setStep(step + 1) : onDone());
  const p = PAGES[step];
  const w = width - space.l * 2;
  const h = Math.round(Math.min(height * 0.46, w * 1.2));
  const visual = p.show === 'stamp' ? <StampShow width={w} height={h} /> : p.show === 'jobs' ? <JobsShow theme={theme} /> : <ReportShow theme={theme} width={w} height={h} />;
  return <Page key={step} theme={theme} title={p.title} line={p.line} visual={visual} dots={{ count: PAGES.length, active: step }} button="Continue" onPress={next} />;
}

/** A sample photo with the real stamp drawn on it, the clock running. */
export function StampShow({ width, height }: { width: number; height: number }) {
  const data = useData();
  const font = useStampFont();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const settings = useMemo(() => ({ ...defaultStamp(regionDefaults(data.region)), template: 'standard' as const, note: 'Siding repair, front wall' }), [data.region]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const content = useMemo(() => stampLines(settings, { time: now, place: { lat: 41.88183, lng: -87.62318, altitude: null, address: '1420 Elm St, Springfield' }, jobName: 'Miller house', company: '', pro: false, hasLogo: false }), [settings, Math.floor(now / 1000)]);
  const w = Math.min(width, Math.round((height * 3) / 4));
  const h = Math.round((w * 4) / 3);
  return (
    <View style={{ width: w, height: h, borderRadius: radius.card, overflow: 'hidden' }} accessible accessibilityRole="image" accessibilityLabel={`A job photo with its stamp: ${content.lines.join('. ')}`}>
      <Image source={SAMPLE} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <StampLayer width={w} height={h} content={content} settings={settings} logo={null} map={null} typeface={font} />
    </View>
  );
}

function JobsShow({ theme }: { theme: Theme }) {
  const rows = [
    { name: 'Miller kitchen', sub: 'Dana Miller, 24 photos, 2 open', tag: 'Camera' },
    { name: 'Ortiz deck', sub: 'Sam Ortiz, 11 photos' },
    { name: 'Lee bathroom', sub: 'Pat Lee, 38 photos, all done' },
  ];
  return (
    <Card theme={theme} style={{ alignSelf: 'stretch' }}>
      {rows.map((r, i) => (
        <Line key={r.name} theme={theme} first={i === 0} label={r.name} sub={r.sub} left={<Image source={SAMPLE} style={{ width: 52, height: 52, borderRadius: radius.chip }} />} right={r.tag ? <Tag theme={theme} kind="plain" label={r.tag} /> : <View />} />
      ))}
    </Card>
  );
}

function ReportShow({ theme, width, height }: { theme: Theme; width: number; height: number }) {
  const pw = Math.min(width * 0.82, height * 0.75);
  const cell = Math.floor((pw - 32 - 10) / 2);
  return (
    <View style={[styles.page, { width: pw, borderColor: theme.edge }]} accessible accessibilityRole="image" accessibilityLabel="A photo report: the job, photos in a grid with captions, and the punch list">
      <View style={{ height: 5, backgroundColor: theme.accent, marginHorizontal: -16, marginTop: -16, marginBottom: 12 }} />
      <Text style={[type.heading, { color: theme.ink }]}>Photo report</Text>
      <Text style={[type.small, { color: theme.inkSoft, marginBottom: space.s }]}>Miller kitchen, Nov 18 to 22</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {[0, 1, 2, 3].map((i) => (
          <Image key={i} source={SAMPLE} style={{ width: cell, height: cell * 0.75, borderRadius: 2 }} />
        ))}
      </View>
      <View style={{ marginTop: space.s, gap: 4 }}>
        {['Fix door latch', 'Caulk the tub'].map((t, i) => (
          <View key={t} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 12, height: 12, borderWidth: 1.2, borderColor: i === 0 ? theme.good : theme.ink, backgroundColor: i === 0 ? theme.good : 'transparent' }} />
            <Text style={[type.small, { color: theme.ink, flex: 1 }]}>{t}</Text>
            <Text style={[type.small, { color: i === 0 ? theme.good : theme.ink, fontWeight: '600' }]}>{i === 0 ? 'Done' : 'Open'}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Camera, location, then saving to Photos: each with its reason, each can be skipped. */
export function Permissions({ onDone }: { onDone: () => void }) {
  const theme = useTheme();
  const data = useData();
  const [step, setStep] = useState<'camera' | 'location' | 'photos'>('camera');
  const [waiting, setWaiting] = useState(false);
  const run = async (fn: () => Promise<unknown>, next: () => void) => {
    setWaiting(true);
    try {
      await fn();
    } catch {
      // a refusal is fine; the app works without it
    }
    setWaiting(false);
    next();
  };
  if (step === 'camera')
    return (
      <Ask
        theme={theme}
        glyph="camera"
        title="The camera takes your job photos."
        line="It opens straight to the camera. Photos stay on this phone."
        button="Allow camera"
        waiting={waiting}
        onPress={() => run(() => ExpoCamera.requestCameraPermissionsAsync(), () => setStep('location'))}
        onSkip={() => setStep('location')}
      />
    );
  if (step === 'location')
    return (
      <Ask
        theme={theme}
        glyph="pin"
        title="Location prints where each photo was taken."
        line="Only while the app is open, never in the background, and it stays on this phone. Without it, photos show the date and time."
        button="Allow location"
        waiting={waiting}
        onPress={() => run(() => Location.requestForegroundPermissionsAsync(), () => setStep('photos'))}
        onSkip={() => setStep('photos')}
      />
    );
  return (
    <Ask
      theme={theme}
      glyph="save"
      title="Save copies to Photos too?"
      line="Every photo stays in the app, filed by job, either way. Turn this on to also add each stamped photo to your Photos library."
      button="Turn on saving"
      skip="Not now"
      waiting={waiting}
      onPress={() =>
        run(async () => {
          if (await askPhotosAccess()) await data.setSaveToPhotos(true);
        }, onDone)
      }
      onSkip={onDone}
    />
  );
}

function Ask({ theme, glyph, title, line, button, onPress, onSkip, waiting, skip = 'Not now' }: { theme: Theme; glyph: GlyphName; title: string; line: string; button: string; onPress: () => void; onSkip: () => void; waiting: boolean; skip?: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { backgroundColor: theme.bg, paddingBottom: Math.max(insets.bottom, space.l) }]}>
      <View style={styles.words}>
        <View style={[styles.badge, { backgroundColor: theme.ink }]}>
          <Glyph name={glyph} size={38} color={theme.accent} weight={2.1} />
        </View>
        <Text style={[type.title, { color: theme.ink, marginTop: space.xl }]} accessibilityRole="header">
          {title}
        </Text>
        <Text style={[type.body, styles.line, { color: theme.inkSoft }]}>{line}</Text>
      </View>
      <View style={styles.footer}>
        {waiting ? <ActivityIndicator color={theme.inkSoft} style={styles.waiting} /> : <GoButton theme={theme} label={button} onPress={onPress} />}
        <Press onPress={onSkip} style={styles.skip} accessibilityRole="button">
          <Text style={[type.body, { color: theme.inkSoft, textAlign: 'center' }]}>{skip}</Text>
        </Press>
      </View>
    </View>
  );
}

/** The trial and reminder screens. Calls onDone right away when no trial is on offer. */
export function TrialSteps({ onDone }: { onDone: () => void }) {
  const theme = useTheme();
  const [offer, setOffer] = useState<TrialOffer | null | undefined>(undefined);
  const [step, setStep] = useState<'trial' | 'remind'>('trial');
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    let live = true;
    trialOffer().then((o) => {
      if (!live) return;
      if (o) setOffer(o);
      else onDone();
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!offer) {
    return (
      <View style={[styles.container, { backgroundColor: theme.bg, justifyContent: 'center' }]}>
        <ActivityIndicator color={theme.inkSoft} />
      </View>
    );
  }

  if (step === 'trial') {
    return (
      <Page
        theme={theme}
        title={`Try Pro free for ${offer.length}.`}
        line={`Then ${offer.then}. Cancel in Settings any time before it ends.`}
        button="Try it free"
        onPress={() => setStep('remind')}
        noPayment
        visual={
          <Card theme={theme} style={{ alignSelf: 'stretch' }}>
            <Line theme={theme} first glyph="check" label="Today" sub="Every job, every report, pairs, punch lists and your logo on the stamp." />
            <Line theme={theme} glyph="calendar" label="The day before it ends" sub="One reminder, so nothing surprises you." />
            <Line theme={theme} glyph="star" label={`After ${offer.length}`} sub={`${offer.then[0].toUpperCase()}${offer.then.slice(1)}. Cancel before then and pay nothing.`} />
          </Card>
        }
      />
    );
  }

  return (
    <Page
      theme={theme}
      title="We’ll remind you the day before it ends."
      line="It is the only notification the app sends."
      button="Continue"
      waiting={waiting}
      onPress={async () => {
        setWaiting(true);
        await requestReminderPermission();
        setWaiting(false);
        onDone();
      }}
    />
  );
}

/** One idea per screen: the product above, one large line, one line under it, the dots and the button. */
function Page({ theme, title, line, dots, button, onPress, waiting = false, noPayment = false, visual }: { theme: Theme; title: string; line?: string; visual?: React.ReactNode; dots?: { count: number; active: number }; button: string; onPress: () => void; waiting?: boolean; noPayment?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { backgroundColor: theme.bg, paddingBottom: Math.max(insets.bottom, space.l) }]}>
      {visual ? <View style={styles.visual}>{visual}</View> : null}
      <View style={visual ? styles.wordsUnder : styles.words}>
        <Text style={[type.title, { color: theme.ink }]} accessibilityRole="header">
          {title}
        </Text>
        {line ? <Text style={[type.body, styles.line, { color: theme.inkSoft }]}>{line}</Text> : null}
      </View>
      {dots && (
        <View style={styles.dots} accessible accessibilityLabel={`Page ${dots.active + 1} of ${dots.count}`}>
          {Array.from({ length: dots.count }, (_, i) => (
            <View key={i} style={[styles.dot, { backgroundColor: i === dots.active ? theme.ink : theme.rule }, i === dots.active && styles.dotOn]} />
          ))}
        </View>
      )}
      <View style={styles.footer}>
        {waiting ? <ActivityIndicator color={theme.inkSoft} style={styles.waiting} /> : <GoButton theme={theme} label={button} onPress={onPress} />}
        {noPayment && (
          <View style={styles.noPaymentRow}>
            <Glyph name="check" size={18} color={theme.ink} weight={2.2} />
            <Text style={[type.strong, { color: theme.ink }]}>No payment now</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  words: { flex: 1, justifyContent: 'center', paddingHorizontal: space.xl },
  visual: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.l, paddingTop: space.l },
  wordsUnder: { paddingHorizontal: space.xl, paddingTop: space.xl, paddingBottom: space.l },
  line: { marginTop: space.m },
  badge: { width: 76, height: 76, borderRadius: radius.card + 6, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: space.s, marginBottom: space.l },
  dot: { width: space.s, height: space.s, borderRadius: radius.round },
  dotOn: { width: space.xl },
  footer: { paddingHorizontal: space.l, gap: space.m, paddingTop: space.m },
  waiting: { height: 60 },
  skip: { minHeight: 44, justifyContent: 'center' },
  noPaymentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.s },
  page: { backgroundColor: '#FFFFFF', borderWidth: 1, borderRadius: 4, padding: 16, overflow: 'hidden' },
});
