/**
 * One photo, as it was saved with its stamp. Share it, save a copy to
 * Photos, mark it Before and take its After, write a caption for the
 * report, or fix the stamp: the stamp is burned again from the original,
 * which the app keeps, with the photo's own time and place.
 *
 * Opened from a job's Photos grid, it swipes left and right through that
 * job's photos in the grid's order; each page keeps its own date, place and
 * caption. Opened from a pair or a punch list item, it shows the one photo.
 */
import React, { useEffect, useState } from 'react';
import { Alert, FlatList, Image, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useTheme, space, Theme } from '../theme';
import { useApp } from '../state';
import { useData } from '../data';
import type { Photo } from '../model';
import { jobLabel } from '../model';
import { longDay, shortDate } from '../jobs';
import { formatCoords, formatTime, partsOf } from '../stamp/format';
import { CORNERS, Corner, SIZES, StampSettings, TEMPLATES } from '../stamp/content';
import { askPhotosAccess, copyToPhotos, restamp } from '../capture';
import { uriOf } from '../store';
import { shareUri } from '../report/build';
import { featureAllowed } from '../gates';
import { Card, Chip, FieldLabel, GoButton, Header, Hint, Input, Line, PlainButton, Sheet, SwitchLine, Tag } from '../ui/Site';
import { savedHaptic } from '../ui/motion';

const CORNER_LABEL: Record<Corner, string> = { topLeft: 'Top left', topRight: 'Top right', bottomLeft: 'Bottom left', bottomRight: 'Bottom right' };

type Nav = { onBack: () => void; onTakeAfter: (before: Photo) => void; onPhoto: (id: string) => void };

export default function PhotoView({ id, ids, ...nav }: Nav & { id: string; ids?: string[] }) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const list = ids && ids.includes(id) && ids.length > 1 ? ids : null;
  const [index, setIndex] = useState(list ? list.indexOf(id) : 0);
  if (!list) return <PhotoPage id={id} {...nav} />;
  return (
    <FlatList
      style={{ flex: 1, backgroundColor: theme.bg }}
      data={list}
      keyExtractor={(x) => x}
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      initialScrollIndex={index}
      getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
      windowSize={3}
      initialNumToRender={1}
      maxToRenderPerBatch={2}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
      renderItem={({ item, index: i }) => (
        <View style={{ width, flex: 1 }}>
          <PhotoPage id={item} position={`${i + 1} of ${list.length}`} {...nav} />
        </View>
      )}
    />
  );
}

function PhotoPage({ id, onBack, onTakeAfter, onPhoto, position }: Nav & { id: string; position?: string }) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const app = useApp();
  const data = useData();
  const [p, setP] = useState<Photo | null>(null);
  const [jobName, setJobName] = useState('');
  const [caption, setCaption] = useState('');
  const [original, setOriginal] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [stamp, setStamp] = useState(0);

  useEffect(() => {
    (async () => {
      const ph = await data.getPhoto(id);
      setP(ph);
      setCaption(ph?.caption ?? '');
      if (ph) setJobName((await data.getJob(ph.jobId))?.name ?? '');
    })();
  }, [data, id, data.version]);

  if (!p) return <View style={{ flex: 1, backgroundColor: theme.bg }} />;
  const h = Math.round((width * p.height) / Math.max(1, p.width));
  const time = formatTime(partsOf(p.takenAt), data.stamp.clock, true);
  const place = p.address ?? (p.lat != null && p.lng != null ? formatCoords(p.lat, p.lng) : null);

  const saveCaption = async () => {
    if (caption.trim() !== p.caption) await data.savePhoto({ ...p, caption: caption.trim() });
  };

  const markBefore = async () => {
    if (p.role !== 'before' && !featureAllowed(app.isPro, 'pairs')) return app.askPro('pairs');
    await data.setRole(p.id, p.role === 'before' ? null : 'before');
    app.say(p.role === 'before' ? 'No longer a Before' : 'Marked Before. Take its After from the same spot.');
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <Header theme={theme} title={jobLabel({ name: jobName })} sub={`${shortDate(p.takenAt)}${p.stamp?.noTime ? '' : `, ${formatTime(partsOf(p.takenAt), data.stamp.clock, false)}`}${position ? `, ${position}` : ''}`} onBack={onBack} />
      <ScrollView contentContainerStyle={{ paddingBottom: space.xxl * 2 }} keyboardShouldPersistTaps="handled">
        <Image key={stamp} source={{ uri: `${uriOf(original ? p.original : p.file)}?v=${stamp}` }} style={{ width, height: Math.min(h, width * 1.5), backgroundColor: '#000' }} resizeMode="contain" accessibilityLabel={original ? 'The original, without the stamp' : `Photo with stamp: ${p.stamp?.lines.join('. ') ?? ''}`} />
        <View style={styles.body}>
          <View style={styles.tags}>
            {p.role ? <Tag theme={theme} kind={p.role} label={p.role === 'before' ? 'Before' : 'After'} /> : null}
            {p.imported ? <Tag theme={theme} kind="imported" label="Imported" /> : null}
            {original ? <Tag theme={theme} kind="plain" label="Original, no stamp" /> : null}
          </View>
          <Card theme={theme}>
            <Line theme={theme} first glyph="calendar" label={p.stamp?.noTime ? 'No date in the file' : `${longDay(p.takenAt)}, ${time}`} sub={p.imported ? 'From the imported file' : 'From this phone’s clock'} />
            <Line theme={theme} glyph="pin" label={place ?? 'No location'} sub={p.address && p.lat != null && p.lng != null ? formatCoords(p.lat, p.lng) : place ? undefined : 'Location was off, or the phone had no recent fix'} />
          </Card>

          <View>
            <FieldLabel theme={theme}>Caption for the report</FieldLabel>
            <Input theme={theme} value={caption} onChangeText={setCaption} onBlur={saveCaption} onSubmitEditing={saveCaption} returnKeyType="done" placeholder="Like Subfloor screwed down" accessibilityLabel="Caption" />
            <Hint theme={theme} style={{ marginTop: space.s }}>Goes under the photo in the report, not on the photo.</Hint>
          </View>

          <GoButton theme={theme} glyph="share" label="Share photo" onPress={() => shareUri(uriOf(p.file), 'image/jpeg', 'public.jpeg', 'Photo').catch((e) => Alert.alert('The photo did not go out', e?.message ?? ''))} />
          <View style={styles.row}>
            <PlainButton
              theme={theme}
              grow
              glyph="save"
              label="Save to Photos"
              onPress={async () => {
                if (!(await askPhotosAccess())) return Alert.alert('Photos said no', 'Allow adding photos for Timestamp Camera in Settings, Privacy, Photos.');
                if (await copyToPhotos(p.file)) {
                  savedHaptic();
                  app.say('Saved to Photos');
                }
              }}
            />
            <PlainButton theme={theme} grow glyph="eye" label={original ? 'Show stamped' : 'Show original'} onPress={() => setOriginal(!original)} />
          </View>
          <Card theme={theme}>
            <Line theme={theme} first glyph="pair" label={p.role === 'before' ? 'Marked Before' : 'Mark as Before'} sub={p.role === 'before' ? 'Tap to take the mark off' : 'Then take its After from the same spot'} onPress={markBefore} right={!app.isPro && p.role !== 'before' ? <Tag theme={theme} kind="plain" label="Pro" /> : undefined} />
            {p.role === 'before' ? <Line theme={theme} glyph="camera" label="Take the After" sub="The Before shows faintly to line up the shot" onPress={() => (featureAllowed(app.isPro, 'pairs') ? onTakeAfter(p) : app.askPro('pairs'))} /> : null}
            {p.role === 'after' && p.pairId ? <Line theme={theme} glyph="photo" label="See the Before" onPress={() => onPhoto(p.pairId!)} /> : null}
            <Line theme={theme} glyph="edit" label="Fix the stamp" sub="Burned again from the original, with this photo’s own time and place" onPress={() => setFixing(true)} />
          </Card>
          <PlainButton
            theme={theme}
            tone="danger"
            glyph="trash"
            label="Delete photo"
            onPress={() =>
              Alert.alert('Delete this photo?', 'The copy in Photos, if one was saved, stays there.', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: async () => {
                    await data.deletePhoto(p.id);
                    onBack();
                  },
                },
              ])
            }
          />
        </View>
      </ScrollView>
      <FixStamp
        theme={theme}
        visible={fixing}
        photo={p}
        base={data.stamp}
        jobName={jobName}
        onClose={() => setFixing(false)}
        onDone={async (settings, note) => {
          const next = await restamp(
            p,
            { settings, ctx: { time: p.stamp?.noTime ? null : p.takenAt, place: p.lat != null && p.lng != null ? { lat: p.lat, lng: p.lng, altitude: p.altitude, address: p.address } : null, jobName, company: data.company, pro: app.isPro, hasLogo: data.logo != null }, logo: data.logo, map: null },
            note
          );
          await data.savePhoto(next);
          setStamp((n) => n + 1);
          setFixing(false);
          setOriginal(false);
          savedHaptic();
          app.say('Stamp fixed');
        }}
      />
    </View>
  );
}

function FixStamp({ theme, visible, photo, base, jobName, onClose, onDone }: { theme: Theme; visible: boolean; photo: Photo; base: StampSettings; jobName: string; onClose: () => void; onDone: (s: StampSettings, note: string) => Promise<void> }) {
  const [s, setS] = useState<StampSettings>(base);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!visible) return;
    const st = photo.stamp;
    setS({ ...base, template: st?.template ?? base.template, corner: st?.corner ?? base.corner, size: st?.size ?? base.size, note: photo.note });
  }, [visible, photo, base]);
  return (
    <Sheet theme={theme} visible={visible} onClose={onClose} title="Fix the stamp">
      <View style={{ gap: space.l, paddingBottom: space.s }}>
        <View>
          <FieldLabel theme={theme}>Note</FieldLabel>
          <Input theme={theme} value={s.note} onChangeText={(note) => setS({ ...s, note })} placeholder="No note" maxLength={120} accessibilityLabel="Note" />
        </View>
        <View style={styles.chips}>
          {TEMPLATES.map((t) => (
            <Chip key={t.id} theme={theme} label={t.label} on={s.template === t.id} onPress={() => setS({ ...s, template: t.id })} />
          ))}
        </View>
        <View style={styles.chips}>
          {CORNERS.map((c) => (
            <Chip key={c} theme={theme} label={CORNER_LABEL[c]} on={s.corner === c} onPress={() => setS({ ...s, corner: c })} />
          ))}
        </View>
        <View style={styles.chips}>
          {SIZES.map((z) => (
            <Chip key={z.id} theme={theme} label={z.label} on={s.size === z.id} onPress={() => setS({ ...s, size: z.id })} />
          ))}
        </View>
        <Card theme={theme}>
          <SwitchLine theme={theme} first label={`Job name: ${jobLabel({ name: jobName })}`} value={s.show.job} onValue={(job) => setS({ ...s, show: { ...s.show, job } })} />
          <SwitchLine theme={theme} label="Note" value={s.show.note} onValue={(note) => setS({ ...s, show: { ...s.show, note } })} />
          <SwitchLine theme={theme} label="Address" value={s.show.address} onValue={(address) => setS({ ...s, show: { ...s.show, address } })} />
          <SwitchLine theme={theme} label="Coordinates" value={s.show.coords} onValue={(coords) => setS({ ...s, show: { ...s.show, coords } })} />
        </Card>
        <Hint theme={theme}>The date, time and place stay as the photo recorded them. The map is not redrawn.</Hint>
        <GoButton
          theme={theme}
          label="Stamp again"
          busy={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await onDone(s, s.show.note ? s.note.trim() : '');
            } catch (e: any) {
              Alert.alert('The stamp was not fixed', e?.message ?? 'Try once more.');
            }
            setBusy(false);
          }}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.l, gap: space.l },
  tags: { flexDirection: 'row', gap: space.s, flexWrap: 'wrap' },
  row: { flexDirection: 'row', gap: space.s },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
});
