/**
 * The camera, the app's home. Dark chrome; the preview is the photo's own
 * 3:4 frame, so the live stamp drawn over it sits exactly where it prints.
 * One very large shutter. The job chip at the top says where the photo
 * goes; tap it to switch jobs or add one.
 *
 * The shutter never waits: the time and place in the live stamp at that
 * moment are what print. The stamp is burned in after the picture is taken,
 * one photo at a time, while the camera stays ready.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Linking, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useTheme, radius, space, type, SHUTTER, Theme } from '../theme';
import { useApp } from '../state';
import { useData } from '../data';
import { useLocation } from '../camera/useLocation';
import MapThumb, { MapPicture } from '../camera/MapThumb';
import StampLayer, { useSkImage, useStampFont } from '../ui/StampLayer';
import { stampLines } from '../stamp/content';
import { turnFor, Turn } from '../stamp/turn';
import { copyToPhotos, makePhoto } from '../capture';
import { readRel, uriOf } from '../store';
import { canAddJob, featureAllowed } from '../gates';
import type { Photo, PunchItem } from '../model';
import { jobLabel } from '../model';
import { shortDate } from '../jobs';
import { formatTime, partsOf } from '../stamp/format';
import Glyph from '../ui/Glyph';
import { Chip, GoButton, IconButton, Input, Press, Sheet, Line, Card, Hint } from '../ui/Site';
import { tick } from '../ui/motion';

export type CameraMode = { kind: 'photo' } | { kind: 'after'; before: Photo } | { kind: 'item'; item: PunchItem };

type Flash = 'off' | 'auto' | 'on';

export default function Camera({ active, mode, onExitMode, onOpenJob, onOpenJobs, onSettings, onStamp }: { active: boolean; mode: CameraMode; onExitMode: () => void; onOpenJob: (id: string) => void; onOpenJobs: () => void; onSettings: () => void; onStamp: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const app = useApp();
  const data = useData();
  const [perm, requestPerm] = useCameraPermissions();
  const loc = useLocation(active, data.stamp.show.address);
  const cam = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [flash, setFlash] = useState<Flash>('off');
  const [nextBefore, setNextBefore] = useState(false);
  const [overlay, setOverlay] = useState(true);
  const [turn, setTurn] = useState<Turn>(0);
  const [saving, setSaving] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [map, setMap] = useState<MapPicture | null>(null);
  const [picker, setPicker] = useState(false);
  const [naming, setNaming] = useState(false);
  const [locSheet, setLocSheet] = useState(false);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const font = useStampFont();

  // The clock in the stamp moves every second while the camera shows.
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);

  useEffect(() => app.setCameraOpen(active), [active, app]);

  const job = data.currentJob;
  const forItem = mode.kind === 'item' ? mode.item : null;
  const jobName = mode.kind === 'after' ? (data.jobs.find((j) => j.id === mode.before.jobId)?.name ?? '') : forItem ? (data.jobs.find((j) => j.id === forItem.jobId)?.name ?? '') : (job?.name ?? '');
  const settings = data.stamp;
  const pro = app.isPro;
  const content = useMemo(
    () => stampLines(settings, { time: now, place: loc.place, jobName: jobName || 'Job 1', company: data.company, pro, hasLogo: data.logo != null }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings, Math.floor(now / 1000), loc.place?.lat, loc.place?.lng, loc.place?.address, loc.place?.altitude, jobName, data.company, pro, data.logo]
  );
  const logoBytes = useMemo(() => {
    try {
      return data.logo ? readRel(data.logo.file) : null;
    } catch {
      return null;
    }
  }, [data.logo]);
  const logoImg = useSkImage(logoBytes);
  const mapImg = useSkImage(map?.png ?? null);
  const wantsMap = settings.template === 'full' && settings.show.map && pro && loc.access === 'granted';

  const previewW = width;
  const previewH = Math.round((width * 4) / 3);

  const enqueue = useCallback((work: () => Promise<void>) => {
    setSaving((n) => n + 1);
    queue.current = queue.current.then(work).catch((e) => Alert.alert('The photo was not saved', e?.message ?? 'Try once more.')).finally(() => setSaving((n) => n - 1));
  }, []);

  const shoot = async () => {
    if (!cam.current || !ready) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    // What the live stamp shows now is what prints.
    const takenAt = Date.now();
    const place = loc.place;
    const stamp = { settings: { ...settings }, ctx: { time: takenAt, place, jobName: '', company: data.company, pro, hasLogo: data.logo != null }, logo: data.logo, map: wantsMap ? map : null };
    let target = mode.kind === 'after' ? mode.before.jobId : forItem ? forItem.jobId : job?.id ?? null;
    let label = jobName;
    let pic: { uri: string } | undefined;
    try {
      pic = await cam.current.takePictureAsync({ quality: 1, exif: false });
    } catch (e: any) {
      Alert.alert('The camera did not take the photo', e?.message ?? 'Try once more.');
      return;
    }
    if (!pic?.uri) return;
    if (!target) {
      const j = await data.createJob();
      target = j.id;
      label = j.name;
    }
    stamp.ctx.jobName = label;
    const role = mode.kind === 'after' ? 'after' : nextBefore && featureAllowed(pro, 'pairs') ? 'before' : null;
    const pairId = mode.kind === 'after' ? mode.before.id : null;
    const jobId = target;
    const uri = pic.uri;
    enqueue(async () => {
      const p = await makePhoto({ uri, jobId, takenAt, place, note: settings.show.note ? settings.note.trim() : '', role, pairId, itemId: forItem?.id ?? null, imported: false, stamp });
      await data.savePhoto(p);
      let copied = true;
      if (data.saveToPhotos) copied = await copyToPhotos(p.file);
      app.say(`${role === 'after' ? 'After saved to' : role === 'before' ? 'Before saved to' : 'Saved to'} ${jobLabel({ name: label })}${copied ? '' : '. Photos did not take a copy.'}`);
    });
    if (mode.kind === 'after') onExitMode();
  };

  const newJob = () => {
    setPicker(false);
    if (!canAddJob(pro, data.jobs.length)) {
      app.askPro('job').then((ok) => ok && setTimeout(() => setNaming(true), 350));
      return;
    }
    setTimeout(() => setNaming(true), 350);
  };

  const chrome = theme.chrome;
  const permGranted = perm?.granted === true;

  return (
    <View style={[styles.root, { backgroundColor: chrome, paddingTop: insets.top }]}>
      {/* Top bar: settings, the job chip, flash. */}
      <View style={styles.top}>
        <IconButton theme={theme} dark glyph="settings" label="Settings" onPress={onSettings} />
        <Press onPress={() => (mode.kind === 'photo' ? setPicker(true) : null)} style={[styles.jobChip, { backgroundColor: theme.chromeRaised }]} accessibilityRole="button" accessibilityLabel={`Job: ${jobLabel({ name: jobName || 'Job 1' })}`} accessibilityHint="Switch jobs or add one">
          <Text style={[type.strong, { color: theme.chromeInk, flexShrink: 1 }]} numberOfLines={1}>
            Job: {jobName || (data.jobs.length ? 'Untitled job' : 'Job 1')}
          </Text>
          {mode.kind === 'photo' ? <Glyph name="down" size={18} color={theme.chromeSoft} /> : null}
        </Press>
        <IconButton theme={theme} dark glyph={flash === 'off' ? 'flashOff' : 'flash'} label={`Flash ${flash}`} onPress={() => setFlash(flash === 'off' ? 'auto' : flash === 'auto' ? 'on' : 'off')} color={flash === 'on' ? theme.accent : undefined} />
      </View>

      {/* The photo's frame. */}
      <View style={{ width: previewW, height: previewH, backgroundColor: '#000' }}>
        {permGranted ? (
          <>
            <CameraView
              ref={cam}
              style={StyleSheet.absoluteFill}
              facing="back"
              mode="picture"
              flash={flash}
              active={active}
              animateShutter
              responsiveOrientationWhenOrientationLocked
              onResponsiveOrientationChanged={(e) => setTurn(turnFor(e.orientation))}
              onCameraReady={() => setReady(true)}
              onMountError={() => setReady(false)}
            />
            {mode.kind === 'after' && overlay ? <Image source={{ uri: uriOf(mode.before.file) }} style={[StyleSheet.absoluteFill, { opacity: 0.38 }]} resizeMode="cover" accessibilityLabel="The Before, faint, to line up the shot" /> : null}
            <StampLayer width={previewW} height={previewH} content={content} settings={settings} logo={logoImg} map={mapImg} typeface={font} turn={turn} />
            {loc.access === 'denied' || loc.access === 'ask' ? (
              <Press onPress={() => setLocSheet(true)} style={[styles.locPill, { backgroundColor: 'rgba(15,17,19,0.72)' }]} accessibilityRole="button" accessibilityLabel="Location is off. The stamp shows the date and time only.">
                <Glyph name="pin" size={16} color={theme.chromeInk} />
                <Text style={[type.small, { color: theme.chromeInk, fontWeight: '600' }]}>Location off</Text>
              </Press>
            ) : null}
            {saving > 0 ? (
              <View style={[styles.savingPill, { backgroundColor: 'rgba(15,17,19,0.72)' }]} accessibilityLiveRegion="polite">
                <Text style={[type.small, { color: theme.chromeInk, fontWeight: '600' }]}>Saving</Text>
              </View>
            ) : null}
          </>
        ) : (
          <NoCamera theme={theme} canAsk={perm?.canAskAgain !== false} onAsk={requestPerm} />
        )}
      </View>

      {/* Mode line: Photo or Before, or what this photo is for. */}
      <View style={styles.modeRow}>
        {mode.kind === 'photo' ? (
          <>
            <Chip theme={theme} dark label="Photo" on={!nextBefore} onPress={() => { tick(); setNextBefore(false); }} />
            <Chip
              theme={theme}
              dark
              label="Before"
              on={nextBefore}
              locked={!pro}
              onPress={() => {
                tick();
                if (!pro) app.askPro('pairs');
                else setNextBefore(!nextBefore);
              }}
            />
          </>
        ) : (
          <View style={[styles.banner, { backgroundColor: theme.chromeRaised }]}>
            <Text style={[type.small, { color: theme.chromeInk, flex: 1, fontWeight: '600' }]} numberOfLines={2}>
              {mode.kind === 'after' ? `After for the Before from ${shortDate(mode.before.takenAt)}, ${formatTime(partsOf(mode.before.takenAt), settings.clock, false)}` : `Photo for: ${mode.item.title}`}
            </Text>
            {mode.kind === 'after' ? <IconButton theme={theme} dark size={40} glyph="eye" label={overlay ? 'Hide the Before' : 'Show the Before'} onPress={() => setOverlay(!overlay)} color={overlay ? theme.accent : theme.chromeSoft} /> : null}
            <IconButton theme={theme} dark size={40} glyph="close" label="Stop" onPress={onExitMode} />
          </View>
        )}
      </View>

      {/* Shutter row. */}
      <View style={[styles.controls, { paddingBottom: Math.max(insets.bottom, space.l) }]}>
        <Press onPress={() => job && onOpenJob(job.id)} disabled={!job} style={[styles.thumb, { borderColor: theme.chromeRaised }]} accessibilityRole="button" accessibilityLabel={job ? `Open ${jobLabel(job)}` : 'No photos yet'}>
          {job?.lastThumb ? <Image source={{ uri: uriOf(job.lastThumb) }} style={styles.thumbImg} /> : <Glyph name="photo" size={24} color={theme.chromeSoft} />}
        </Press>
        <Press onPress={shoot} disabled={!permGranted || !ready} style={[styles.shutter, { borderColor: theme.accent, opacity: permGranted ? 1 : 0.35 }]} pressedStyle={{ transform: [{ scale: 0.94 }] }} accessibilityRole="button" accessibilityLabel="Take photo" accessibilityHint={`Saves to ${jobLabel({ name: jobName || 'Job 1' })}`}>
          <View style={[styles.shutterCore, { backgroundColor: theme.chromeInk }]} />
        </Press>
        <View style={{ alignItems: 'center', width: 64 }}>
          <IconButton theme={theme} dark solid glyph="stamp" label="Stamp settings" onPress={onStamp} size={56} />
          <Text style={[type.label, { color: theme.chromeSoft, fontSize: 12, marginTop: 2 }]}>Stamp</Text>
        </View>
      </View>

      <MapThumb fix={loc.fix} enabled={active && wantsMap} current={map} onPicture={setMap} />

      <Sheet theme={theme} visible={picker} onClose={() => setPicker(false)} title="Jobs">
        <Card theme={theme} style={{ marginBottom: space.m }}>
          {data.jobs.map((j, i) => (
            <Line
              key={j.id}
              theme={theme}
              first={i === 0}
              label={jobLabel(j)}
              sub={[j.client, j.photoCount === 1 ? '1 photo' : `${j.photoCount} photos`].filter(Boolean).join(', ')}
              onPress={() => {
                data.setCurrentJob(j.id);
                setPicker(false);
              }}
              right={j.id === job?.id ? <Glyph name="check" size={22} color={theme.ink} weight={2.4} /> : <View />}
            />
          ))}
          <Line theme={theme} first={data.jobs.length === 0} glyph="plus" label="New job" onPress={newJob} right={!canAddJob(pro, data.jobs.length) ? <Glyph name="lock" size={16} color={theme.inkFaint} /> : <View />} />
        </Card>
        <Line theme={theme} first glyph="jobs" label="All jobs" sub="Photos by day, before and after, punch lists, reports" onPress={() => { setPicker(false); onOpenJobs(); }} />
      </Sheet>

      <NewJobSheet theme={theme} visible={naming} onClose={() => setNaming(false)} address={loc.place?.address ?? null} onMake={async (name, address, client) => {
        const j = await data.createJob({ name, address, client });
        setNaming(false);
        app.say(`Job: ${jobLabel(j)}`);
      }} />

      <Sheet theme={theme} visible={locSheet} onClose={() => setLocSheet(false)} title="Location is off">
        <Text style={[type.body, { color: theme.ink }]}>Photos still save with the date and time. With location on, the stamp also prints the address and the coordinates of where you stood.</Text>
        <Hint theme={theme} style={{ marginTop: space.s, marginBottom: space.l }}>It is only used while the camera is open. The street address is looked up by Apple’s location service, which receives the coordinates; turn the Address line off in Stamp and no lookup is made.</Hint>
        <GoButton
          theme={theme}
          label={loc.access === 'ask' ? 'Turn on location' : 'Open Settings'}
          onPress={async () => {
            if (loc.access === 'ask') await loc.request();
            else Linking.openSettings().catch(() => {});
            setLocSheet(false);
          }}
        />
      </Sheet>
    </View>
  );
}

function NoCamera({ theme, canAsk, onAsk }: { theme: Theme; canAsk: boolean; onAsk: () => void }) {
  return (
    <View style={styles.noCam}>
      <Glyph name="camera" size={44} color={theme.chromeSoft} />
      <Text style={[type.heading, { color: theme.chromeInk, textAlign: 'center', marginTop: space.m }]}>The camera is off for this app.</Text>
      <Text style={[type.body, { color: theme.chromeSoft, textAlign: 'center', marginTop: space.s, marginBottom: space.xl }]}>It takes your job photos. Photos stay on your phone until you share them.</Text>
      <GoButton theme={theme} label={canAsk ? 'Allow camera' : 'Open Settings'} onPress={() => (canAsk ? onAsk() : Linking.openSettings().catch(() => {}))} />
    </View>
  );
}

function NewJobSheet({ theme, visible, onClose, onMake, address }: { theme: Theme; visible: boolean; onClose: () => void; onMake: (name: string, address: string, client: string) => void; address: string | null }) {
  const [name, setName] = useState('');
  const [addr, setAddr] = useState('');
  const [client, setClient] = useState('');
  useEffect(() => {
    if (visible) {
      setName('');
      setAddr('');
      setClient('');
    }
  }, [visible]);
  return (
    <Sheet theme={theme} visible={visible} onClose={onClose} title="New job">
      <View style={{ gap: space.m, paddingBottom: space.s }}>
        <Input theme={theme} value={name} onChangeText={setName} placeholder="Job name, like Miller kitchen" autoFocus autoCapitalize="words" returnKeyType="next" accessibilityLabel="Job name" />
        <Input theme={theme} value={client} onChangeText={setClient} placeholder="Client (optional)" autoCapitalize="words" accessibilityLabel="Client" />
        <Input theme={theme} value={addr} onChangeText={setAddr} placeholder="Address (optional)" accessibilityLabel="Address" />
        {address && !addr ? <Chip theme={theme} label={`Use ${address}`} on={false} glyph="pin" onPress={() => setAddr(address)} /> : null}
        <GoButton theme={theme} label="Make job" onPress={() => onMake(name, addr, client)} disabled={!name.trim()} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.s, minHeight: 60, gap: space.s },
  jobChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, minHeight: 44, borderRadius: radius.round, paddingHorizontal: space.l },
  locPill: { position: 'absolute', top: space.m, left: space.m, flexDirection: 'row', alignItems: 'center', gap: space.xs, borderRadius: radius.round, paddingHorizontal: space.m, minHeight: 34 },
  savingPill: { position: 'absolute', top: space.m, right: space.m, borderRadius: radius.round, paddingHorizontal: space.m, minHeight: 34, justifyContent: 'center' },
  modeRow: { flexDirection: 'row', justifyContent: 'center', gap: space.s, paddingHorizontal: space.l, paddingTop: space.m, minHeight: 60 },
  banner: { flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: radius.card, paddingLeft: space.m, gap: space.xs, minHeight: 48 },
  controls: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.xl },
  thumb: { width: 60, height: 60, borderRadius: radius.chip, borderWidth: 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  thumbImg: { width: '100%', height: '100%' },
  shutter: { width: SHUTTER, height: SHUTTER, borderRadius: radius.round, borderWidth: 6, alignItems: 'center', justifyContent: 'center' },
  shutterCore: { width: SHUTTER - 22, height: SHUTTER - 22, borderRadius: radius.round },
  noCam: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
});
