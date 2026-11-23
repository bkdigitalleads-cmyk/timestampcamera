/**
 * The photo report for one job: choose what goes in, have the client sign
 * if they are there, see every page as it will print, then Share (Mail,
 * Messages, Save to Files and the rest) or Print. The first report is
 * free; a job whose report went out free can always send it again.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Skia, SkImage } from '@shopify/react-native-skia';
import { useTheme, space, type, Theme } from '../theme';
import { useApp } from '../state';
import { useData } from '../data';
import type { Job, Photo, PunchItem } from '../model';
import { jobLabel } from '../model';
import { dayKey, dayLabel, pairsOf, photosByDay } from '../jobs';
import { reportDecision } from '../gates';
import { KEYS, fileName } from '../settings';
import { layout, printPdf, reportImages, reportKit, ReportKit, reportPdf, sharePdf } from '../report/build';
import type { Report as ReportT, ReportOptions, Signoff } from '../report/layout';
import { maybeRequestReview } from '../reviews';
import { compactStroke, hasInk, Stroke } from '../stroke';
import Pad from '../ui/Pad';
import PageView from '../ui/PageView';
import { Card, Chip, FieldLabel, GoButton, Header, Hint, IconButton, Input, PlainButton, SwitchLine } from '../ui/Site';
import { savedHaptic } from '../ui/motion';

export default function Report({ jobId, onBack }: { jobId: string; onBack: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const app = useApp();
  const data = useData();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [items, setItems] = useState<PunchItem[]>([]);
  const [signoff, setSignoff] = useState<Signoff | null>(null);
  const [kit, setKit] = useState<ReportKit | null>(null);
  const [options, setOptions] = useState<ReportOptions>({ photos: true, pairs: true, punch: true, signature: true, days: null });
  const [images, setImages] = useState<Record<string, Uint8Array> | null>(null);
  const [busy, setBusy] = useState<'share' | 'print' | null>(null);
  const [signing, setSigning] = useState(false);
  const cache = useRef(new Map<string, Uint8Array>());
  const announced = useRef(false);

  // The gate: the first report is free; a second job's report opens the paywall.
  useEffect(() => {
    const d = reportDecision(app.isPro, app.freeReports, jobId);
    if (d.allowed) setAllowed(true);
    else app.askPro('report').then((ok) => (ok ? setAllowed(true) : onBack()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      setJob(await data.getJob(jobId));
      setPhotos(await data.photos(jobId));
      setItems(await data.items(jobId));
      try {
        const s = JSON.parse((await data.kvGet(KEYS.signoff(jobId))) ?? 'null');
        if (s && Array.isArray(s.strokes)) setSignoff(s);
      } catch {
        // no sign-off
      }
      try {
        setKit(await reportKit());
      } catch (e: any) {
        Alert.alert('The report fonts did not load', e?.message ?? '');
      }
    })();
  }, [data, jobId]);

  const report: ReportT | null = useMemo(() => {
    if (!kit || !job) return null;
    return layout(kit, { company: data.company, logo: data.logo ? { width: data.logo.width, height: data.logo.height } : null, job, photos, items, signoff, options, paper: data.paper, clock: data.stamp.clock, now: Date.now() });
  }, [kit, job, photos, items, signoff, options, data.company, data.logo, data.paper, data.stamp.clock]);

  // Each photo's report copy: made after the screen shows, so the spinner can draw first.
  useEffect(() => {
    if (!report || !allowed) return;
    setImages(null);
    const t = setTimeout(() => {
      setImages(reportImages(report, photos, data.logo?.file ?? null, cache.current));
      if (!announced.current) {
        announced.current = true;
        app.say('Photo report ready.');
      }
    }, 60);
    return () => clearTimeout(t);
  }, [report, photos, data.logo, allowed, app]);

  const sk = useMemo(() => {
    const out: Record<string, SkImage | null> = {};
    if (images) for (const [k, v] of Object.entries(images)) out[k] = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(v));
    return out;
  }, [images]);

  if (allowed !== true || !job) return <View style={{ flex: 1, backgroundColor: theme.bg }} />;
  const days = photosByDay(photos);
  const pairCount = pairsOf(photos).filter((p) => p.after).length;
  const name = fileName(['Photo report', jobLabel(job), dayKey(Date.now())], 'pdf');

  const go = async (how: 'share' | 'print') => {
    if (!report || !images || !kit) return;
    const d = reportDecision(app.isPro, app.freeReports, jobId);
    if (!d.allowed) {
      if (!(await app.askPro('report'))) return;
    }
    setBusy(how);
    try {
      const bytes = await reportPdf(kit, report, images, { job: jobLabel(job), company: data.company });
      if (how === 'share') await sharePdf(name, bytes);
      else await printPdf(name, bytes);
      if (d.usesFree) app.noteFreeReport(jobId);
      if (how === 'share') maybeRequestReview('reportShared');
    } catch (e: any) {
      if (!/cancel/i.test(e?.message ?? '')) Alert.alert('The report did not go out', e?.message ?? 'Try once more.');
    }
    setBusy(null);
  };

  const pageW = width - space.l * 2;
  const opt = (patch: Partial<ReportOptions>) => setOptions({ ...options, ...patch });

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <Header theme={theme} title="Photo report" sub={jobLabel(job)} onBack={onBack} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View>
          <FieldLabel theme={theme}>In the report</FieldLabel>
          <Card theme={theme}>
            <SwitchLine theme={theme} first label="Photos" sub={`${photos.length} in this job`} value={options.photos} onValue={(v) => opt({ photos: v })} />
            <SwitchLine theme={theme} label="Before and after" sub={pairCount ? `${pairCount} ${pairCount === 1 ? 'pair' : 'pairs'}, side by side` : 'No pairs yet'} value={options.pairs} onValue={(v) => opt({ pairs: v })} />
            <SwitchLine theme={theme} label="Punch list" sub={items.length ? `${items.length} ${items.length === 1 ? 'item' : 'items'} with their status` : 'No items yet'} value={options.punch} onValue={(v) => opt({ punch: v })} />
            <SwitchLine theme={theme} label="Client sign-off" sub={signoff ? `Signed by ${signoff.name || 'the client'}` : 'Not signed yet'} value={options.signature} onValue={(v) => opt({ signature: v })} />
          </Card>
        </View>
        {days.length > 1 ? (
          <View>
            <FieldLabel theme={theme} right={options.days ? <Text style={[type.small, { color: theme.ink, fontWeight: '600' }]} onPress={() => opt({ days: null })}>Every day</Text> : undefined}>
              Days
            </FieldLabel>
            <View style={styles.chips}>
              {days.map((d) => {
                const on = !options.days || options.days.includes(d.key);
                return (
                  <Chip
                    key={d.key}
                    theme={theme}
                    label={dayLabel(d.key, Date.now())}
                    on={on}
                    onPress={() => {
                      const cur = options.days ?? days.map((x) => x.key);
                      const next = on ? cur.filter((k) => k !== d.key) : [...cur, d.key];
                      opt({ days: next.length === days.length ? null : next.length ? next : cur });
                    }}
                  />
                );
              })}
            </View>
          </View>
        ) : null}
        <PlainButton theme={theme} glyph="sign" label={signoff ? 'Sign again' : 'Client signs here'} onPress={() => setSigning(true)} />
        <Hint theme={theme}>Share report opens the share sheet: Mail, Messages, Save to Files and the rest.</Hint>

        <FieldLabel theme={theme} right={report ? <Text style={[type.small, { color: theme.inkSoft }]}>{report.pages.length === 1 ? '1 page' : `${report.pages.length} pages`}</Text> : undefined}>
          Preview
        </FieldLabel>
        {!report || !images || !kit ? (
          <View style={styles.wait}>
            <ActivityIndicator color={theme.inkSoft} />
            <Hint theme={theme}>Building the report</Hint>
          </View>
        ) : (
          report.pages.map((pg, i) => <PageView key={i} page={pg} width={pageW} faces={kit.faces} images={sk} label={`Page ${i + 1} of ${report.pages.length}`} />)
        )}
      </ScrollView>
      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, space.m), borderTopColor: theme.rule }]}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <GoButton theme={theme} glyph="share" label="Share report" onPress={() => go('share')} busy={busy === 'share'} disabled={!images || busy != null} hint="Mail, Messages, Save to Files and more" />
          </View>
          <PlainButton theme={theme} glyph="print" label="Print" onPress={() => go('print')} disabled={!images || busy != null} />
        </View>
      </View>
      <SignSheet
        theme={theme}
        visible={signing}
        client={job.client}
        onClose={() => setSigning(false)}
        onDone={async (s) => {
          setSignoff(s);
          await data.kvSet(KEYS.signoff(jobId), JSON.stringify(s));
          opt({ signature: true });
          setSigning(false);
          savedHaptic();
        }}
      />
    </View>
  );
}

function SignSheet({ theme, visible, client, onClose, onDone }: { theme: Theme; visible: boolean; client: string; onClose: () => void; onDone: (s: Signoff) => void }) {
  const { width } = useWindowDimensions();
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [name, setName] = useState(client);
  useEffect(() => {
    if (visible) {
      setStrokes([]);
      setName(client);
    }
  }, [visible, client]);
  const insets = useSafeAreaInsets();
  const w = width - space.l * 2;
  return (
    <Modal visible={visible} animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: theme.bg, paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, space.m) }}>
        <Header theme={theme} title="Client sign-off" onBack={onClose} glyph="close" />
        <View style={{ flex: 1, paddingHorizontal: space.l, gap: space.m }}>
          <Text style={[type.body, { color: theme.inkSoft }]}>Hand the phone to the client. Their signature goes at the end of the report.</Text>
          <Pad theme={theme} width={w} height={220} strokes={strokes} onStroke={(s) => setStrokes([...strokes, s])} pen="ink" size={1} inkHex="#1A1A1E" placeholder="Sign with a finger" />
          <View style={styles.row}>
            <IconButton theme={theme} solid glyph="undo" label="Undo" disabled={!strokes.length} onPress={() => setStrokes(strokes.slice(0, -1))} />
            <IconButton theme={theme} solid glyph="clear" label="Clear" disabled={!strokes.length} onPress={() => setStrokes([])} />
          </View>
          <Input theme={theme} value={name} onChangeText={setName} placeholder="Client’s name" autoCapitalize="words" accessibilityLabel="Client’s name" />
        </View>
        <View style={{ paddingHorizontal: space.l }}>
          <GoButton theme={theme} label="Done" disabled={!hasInk(strokes)} onPress={() => onDone({ strokes: strokes.map(compactStroke), name: name.trim(), at: Date.now() })} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: space.l, gap: space.l, paddingBottom: space.xxl },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  row: { flexDirection: 'row', gap: space.s, alignItems: 'center' },
  wait: { alignItems: 'center', gap: space.s, paddingVertical: space.xxl },
  bottom: { paddingHorizontal: space.l, paddingTop: space.m, gap: space.s, borderTopWidth: StyleSheet.hairlineWidth },
});
