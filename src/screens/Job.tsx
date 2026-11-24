/**
 * One job: its photos by day, its before and after pairs, its punch list,
 * and Build report at the bottom. Pairs and punch lists are Pro to start;
 * anything already made stays readable and usable without it.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActionSheetIOS, Alert, Image, Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useTheme, radius, space, type, Theme } from '../theme';
import { useApp } from '../state';
import { useData } from '../data';
import type { Job as JobT, Photo, PunchItem } from '../model';
import { jobLabel, newId } from '../model';
import { dayLabel, pairsOf, photoCount, photoOrder, photosByDay, Pair } from '../jobs';
import { addItem, moveItem, ordered, punchSummary, toggleItem } from '../punch';
import { canAddJob, featureAllowed } from '../gates';
import { importedPlace, makePhoto } from '../capture';
import { readJpeg } from '../stamp/exif';
import { importMeta } from '../stamp/importMeta';
import { readUri, uriOf } from '../store';
import { sharePair } from '../report/build';
import { fileName } from '../settings';
import Glyph from '../ui/Glyph';
import { Card, Chip, GoButton, Header, Hint, IconButton, Input, InputLine, Line, PlainButton, Press, Sheet, Tag } from '../ui/Site';
import { savedHaptic, tick } from '../ui/motion';

export type JobTab = 'photos' | 'pairs' | 'punch';

export default function Job({ id, onBack, onPhoto, onTakeAfter, onShootItem, onReport, onCamera, tab: startTab = 'photos' }: { id: string; onBack: () => void; onPhoto: (id: string, ids?: string[]) => void; onTakeAfter: (before: Photo) => void; onShootItem: (item: PunchItem) => void; onReport: (jobId: string) => void; onCamera: () => void; tab?: JobTab }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const app = useApp();
  const data = useData();
  const [job, setJob] = useState<JobT | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [items, setItems] = useState<PunchItem[]>([]);
  const [tab, setTab] = useState<JobTab>(startTab);
  const [editing, setEditing] = useState(false);
  const [item, setItem] = useState<PunchItem | null>(null);
  const [pair, setPair] = useState<Pair | null>(null);
  const [importing, setImporting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setJob(await data.getJob(id));
    setPhotos(await data.photos(id));
    setItems(await data.items(id));
  }, [data, id]);

  useEffect(() => {
    load();
  }, [load, data.version]);

  if (!job) return <View style={{ flex: 1, backgroundColor: theme.bg }} />;
  const pairs = pairsOf(photos);
  const isCurrent = data.currentJobId === id;

  const more = () => {
    const options = ['Edit job', isCurrent ? 'The camera is on this job' : 'Use this job on the camera', 'Delete job', 'Cancel'];
    const act = (i: number) => {
      if (i === 0) setEditing(true);
      else if (i === 1 && !isCurrent) data.setCurrentJob(id).then(() => app.say(`Job: ${jobLabel(job)}`));
      else if (i === 2)
        Alert.alert(`Delete ${jobLabel(job)}?`, `${photoCount(photos.length)} and the punch list go with it. Copies already saved to Photos stay there.`, [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete job',
            style: 'destructive',
            onPress: async () => {
              await data.deleteJob(id);
              onBack();
            },
          },
        ]);
    };
    if (Platform.OS === 'ios') ActionSheetIOS.showActionSheetWithOptions({ options, destructiveButtonIndex: 2, cancelButtonIndex: 3 }, act);
    else act(0);
  };

  const importPhotos = async () => {
    if (!featureAllowed(app.isPro, 'import')) {
      app.askPro('import');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 20, quality: 1, exif: true, preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible });
    if (res.canceled || !res.assets?.length) return;
    let done = 0;
    for (const a of res.assets) {
      setImporting(`Stamping ${done + 1} of ${res.assets.length}`);
      try {
        const meta = importMeta(readJpeg(readUri(a.uri)), a.exif ?? null);
        const place = await importedPlace(meta.lat, meta.lng, meta.altitude, data.stamp.show.address);
        const p = await makePhoto({
          uri: a.uri,
          jobId: id,
          takenAt: meta.takenAt ?? Date.now(),
          place,
          note: data.stamp.show.note ? data.stamp.note.trim() : '',
          role: null,
          pairId: null,
          itemId: null,
          imported: true,
          stamp: { settings: data.stamp, ctx: { time: meta.takenAt, place, jobName: job.name, company: data.company, pro: app.isPro, hasLogo: data.logo != null }, logo: data.logo, map: null },
        });
        await data.savePhoto(p);
        done++;
      } catch {
        // skip a file that cannot be read
      }
    }
    setImporting(null);
    app.say(done === res.assets.length ? `Imported ${done === 1 ? '1 photo' : `${done} photos`}` : `Imported ${done} of ${res.assets.length}. Some files could not be read.`);
  };

  const addPunch = async (title: string) => {
    if (!featureAllowed(app.isPro, 'punch')) {
      app.askPro('punch');
      return false;
    }
    const it = addItem(items, { id: newId(Date.now()), jobId: id, title, now: Date.now() });
    if (!it) return false;
    await data.saveItem(it);
    return true;
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <Header theme={theme} title={jobLabel(job)} sub={[job.client, job.address].filter(Boolean).join(', ') || undefined} onBack={onBack} right={<IconButton theme={theme} glyph="more" label="More for this job" onPress={more} />} />
      <View style={styles.tabs}>
        <Chip theme={theme} label={`Photos ${photos.length}`} on={tab === 'photos'} onPress={() => { tick(); setTab('photos'); }} />
        <Chip theme={theme} label={`Before and after ${pairs.length || ''}`.trim()} on={tab === 'pairs'} onPress={() => { tick(); setTab('pairs'); }} />
        <Chip theme={theme} label={`Punch list ${items.length || ''}`.trim()} on={tab === 'punch'} onPress={() => { tick(); setTab('punch'); }} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {tab === 'photos' ? <PhotosTab theme={theme} photos={photos} onPhoto={(pid) => onPhoto(pid, photoOrder(photos))} onImport={importPhotos} importing={importing} pro={app.isPro} onCamera={() => { data.setCurrentJob(id); onCamera(); }} /> : null}
        {tab === 'pairs' ? (
          <PairsTab
            theme={theme}
            pairs={pairs}
            onPair={setPair}
            onTakeAfter={(b) => (featureAllowed(app.isPro, 'pairs') ? onTakeAfter(b) : app.askPro('pairs'))}
            pro={app.isPro}
            onClearUnpaired={(befores) =>
              Alert.alert(`Take the Before mark off ${befores.length} photos?`, 'They stay in the job as photos. Befores that have an After keep their mark.', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Take it off',
                  onPress: async () => {
                    for (const b of befores) await data.setRole(b.id, null);
                    app.say(`${befores.length} photos are no longer Befores`);
                  },
                },
              ])
            }
          />
        ) : null}
        {tab === 'punch' ? (
          <PunchTab
            theme={theme}
            items={items}
            photos={photos}
            onAdd={addPunch}
            onToggle={async (it) => {
              savedHaptic();
              await data.saveItem(toggleItem(it, Date.now()));
            }}
            onOpen={setItem}
            onShoot={(it) => {
              data.setCurrentJob(id);
              onShootItem(it);
            }}
            pro={app.isPro}
          />
        ) : null}
      </ScrollView>
      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, space.m), borderTopColor: theme.rule, backgroundColor: theme.bg }]}>
        <GoButton theme={theme} glyph="report" label="Build report" onPress={() => onReport(id)} disabled={photos.length === 0 && items.length === 0} />
      </View>

      <JobSheet theme={theme} visible={editing} job={job} onClose={() => setEditing(false)} onSave={async (j) => { await data.saveJob(j); setEditing(false); }} />
      <ItemSheet
        theme={theme}
        item={item}
        photos={photos.filter((p) => p.itemId === item?.id)}
        onClose={() => setItem(null)}
        onSave={async (it) => { await data.saveItem({ ...it, updatedAt: Date.now() }); setItem(null); }}
        onDelete={async (it) => { await data.deleteItem(it.id); setItem(null); }}
        onMove={async (it, dir) => { for (const m of moveItem(items, it.id, dir, Date.now())) await data.saveItem(m); }}
        onPhoto={(pid) => { setItem(null); onPhoto(pid); }}
        onShoot={(it) => { setItem(null); data.setCurrentJob(id); onShootItem(it); }}
      />
      <PairSheet theme={theme} pair={pair} onClose={() => setPair(null)} jobName={job.name} onPhoto={(pid) => { setPair(null); onPhoto(pid); }} />
    </View>
  );
}

// ---------- photos ----------

function Thumb({ theme, p, size, onPress }: { theme: Theme; p: Photo; size: number; onPress: () => void }) {
  return (
    <Press onPress={onPress} style={{ width: size, height: size, borderRadius: radius.chip, overflow: 'hidden', backgroundColor: theme.well }} accessibilityRole="button" accessibilityLabel={`Photo${p.role ? `, ${p.role}` : ''}${p.imported ? ', imported' : ''}${p.caption ? `, ${p.caption}` : ''}`}>
      <Image source={{ uri: uriOf(p.thumb) }} style={{ width: size, height: size }} />
      {p.role || p.imported ? (
        <View style={styles.thumbTag}>
          <Tag theme={theme} kind={p.role === 'before' ? 'before' : p.role === 'after' ? 'after' : 'imported'} label={p.role === 'before' ? 'Before' : p.role === 'after' ? 'After' : 'Imported'} />
        </View>
      ) : null}
    </Press>
  );
}

function PhotosTab({ theme, photos, onPhoto, onImport, importing, pro, onCamera }: { theme: Theme; photos: Photo[]; onPhoto: (id: string) => void; onImport: () => void; importing: string | null; pro: boolean; onCamera: () => void }) {
  const { width } = useWindowDimensions();
  const size = Math.floor((width - space.l * 2 - space.s * 2) / 3);
  const now = Date.now();
  return (
    <View style={{ gap: space.xl }}>
      {photos.length === 0 ? (
        <Card theme={theme} style={{ padding: space.l, gap: space.s }}>
          <Text style={[type.strong, { color: theme.ink }]}>No photos yet.</Text>
          <Text style={[type.body, { color: theme.inkSoft }]}>Photos you take with this job on the camera land here, by day.</Text>
          <PlainButton theme={theme} glyph="camera" label="Take photos for this job" onPress={onCamera} />
        </Card>
      ) : (
        photosByDay(photos).map((d) => (
          <View key={d.key}>
            <View style={styles.dayHead}>
              <Text style={[type.heading, { color: theme.ink }]} accessibilityRole="header">
                {dayLabel(d.key, now)}
              </Text>
              <Text style={[type.small, { color: theme.inkSoft }]}>{photoCount(d.photos.length)}</Text>
            </View>
            <View style={styles.grid}>
              {d.photos.map((p) => (
                <Thumb key={p.id} theme={theme} p={p} size={size} onPress={() => onPhoto(p.id)} />
              ))}
            </View>
          </View>
        ))
      )}
      <PlainButton theme={theme} glyph="import" label={importing ?? 'Import from Photos'} onPress={onImport} disabled={!!importing} hint={pro ? 'Stamps photos you already took with their own date and place' : 'Pro'} />
      <Hint theme={theme}>Imported photos use their own date and place when the file has them, and are marked Imported here.</Hint>
    </View>
  );
}

// ---------- before and after ----------

function PairsTab({ theme, pairs, onPair, onTakeAfter, pro, onClearUnpaired }: { theme: Theme; pairs: Pair[]; onPair: (p: Pair) => void; onTakeAfter: (b: Photo) => void; pro: boolean; onClearUnpaired: (befores: Photo[]) => void }) {
  const { width } = useWindowDimensions();
  const w = Math.floor((width - space.l * 2 - space.s) / 2);
  if (pairs.length === 0)
    return (
      <Card theme={theme} style={{ padding: space.l, gap: space.s }}>
        <Text style={[type.strong, { color: theme.ink }]}>No pairs yet.</Text>
        <Text style={[type.body, { color: theme.inkSoft }]}>Switch the camera to Before, or open a photo and mark it Before. Then take its After from the same spot, with the Before shown faintly to line up the shot.</Text>
        {!pro ? <Hint theme={theme}>Before and after pairs are part of Pro.</Hint> : null}
      </Card>
    );
  const unpaired = pairs.filter((p) => !p.after).map((p) => p.before);
  return (
    <View style={{ gap: space.l }}>
      {unpaired.length >= 2 ? (
        <Card theme={theme} style={{ padding: space.l, gap: space.s }}>
          <Text style={[type.body, { color: theme.ink }]}>{unpaired.length} Befores have no After yet.</Text>
          <PlainButton theme={theme} glyph="pair" label="Take the Before mark off these" onPress={() => onClearUnpaired(unpaired)} />
          <Hint theme={theme}>They stay in the job as photos. Befores that have an After are not touched.</Hint>
        </Card>
      ) : null}
      {pairs.map((p) => (
        <View key={p.before.id} style={{ flexDirection: 'row', gap: space.s }}>
          <Press onPress={() => onPair(p)} style={{ width: w }} accessibilityRole="button" accessibilityLabel="Before photo">
            <Image source={{ uri: uriOf(p.before.thumb) }} style={{ width: w, height: Math.round(w * 0.75), borderRadius: radius.chip }} />
            <View style={styles.pairTag}><Tag theme={theme} kind="before" label="Before" /></View>
          </Press>
          {p.after ? (
            <Press onPress={() => onPair(p)} style={{ width: w }} accessibilityRole="button" accessibilityLabel="After photo">
              <Image source={{ uri: uriOf(p.after.thumb) }} style={{ width: w, height: Math.round(w * 0.75), borderRadius: radius.chip }} />
              <View style={styles.pairTag}><Tag theme={theme} kind="after" label="After" /></View>
            </Press>
          ) : (
            <Press onPress={() => onTakeAfter(p.before)} style={[styles.takeAfter, { width: w, height: Math.round(w * 0.75), borderColor: theme.ink }]} accessibilityRole="button" accessibilityLabel="Take the After">
              <Glyph name="camera" size={26} color={theme.ink} />
              <Text style={[type.strong, { color: theme.ink }]}>Take the After</Text>
            </Press>
          )}
        </View>
      ))}
    </View>
  );
}

function PairSheet({ theme, pair, onClose, jobName, onPhoto }: { theme: Theme; pair: Pair | null; onClose: () => void; jobName: string; onPhoto: (id: string) => void }) {
  const { width } = useWindowDimensions();
  const [busy, setBusy] = useState(false);
  const w = Math.floor((width - space.l * 2 - space.s) / 2);
  return (
    <Sheet theme={theme} visible={pair != null} onClose={onClose} title="Before and after">
      {pair ? (
        <View style={{ gap: space.l, paddingBottom: space.s }}>
          <View style={{ flexDirection: 'row', gap: space.s }}>
            {[pair.before, pair.after].map((p, i) =>
              p ? (
                <Press key={p.id} onPress={() => onPhoto(p.id)} accessibilityRole="button" accessibilityLabel={i === 0 ? 'Open the Before' : 'Open the After'}>
                  <Image source={{ uri: uriOf(p.thumb) }} style={{ width: w, height: Math.round((w * p.height) / Math.max(1, p.width)), borderRadius: radius.chip }} />
                </Press>
              ) : (
                <View key="none" style={{ width: w }} />
              )
            )}
          </View>
          {pair.after ? (
            <GoButton
              theme={theme}
              glyph="share"
              label="Share the pair"
              busy={busy}
              onPress={async () => {
                setBusy(true);
                try {
                  await sharePair(pair.before, pair.after!, fileName(['Before and after', jobName], 'jpg'));
                } catch (e: any) {
                  Alert.alert('The pair did not go out', e?.message ?? 'Try once more.');
                }
                setBusy(false);
              }}
            />
          ) : null}
          <Hint theme={theme}>Shares one image with the Before on the left and the After on the right, each with its own stamp.</Hint>
        </View>
      ) : null}
    </Sheet>
  );
}

// ---------- punch list ----------

function PunchTab({ theme, items, photos, onAdd, onToggle, onOpen, onShoot, pro }: { theme: Theme; items: PunchItem[]; photos: Photo[]; onAdd: (title: string) => Promise<boolean>; onToggle: (i: PunchItem) => void; onOpen: (i: PunchItem) => void; onShoot: (i: PunchItem) => void; pro: boolean }) {
  const [title, setTitle] = useState('');
  const counts = new Map<string, number>();
  for (const p of photos) if (p.itemId) counts.set(p.itemId, (counts.get(p.itemId) ?? 0) + 1);
  const submit = async () => {
    if (await onAdd(title)) setTitle('');
  };
  return (
    <View style={{ gap: space.l }}>
      <View style={{ flexDirection: 'row', gap: space.s }}>
        <Input theme={theme} value={title} onChangeText={setTitle} placeholder="Add an item, like Fix door latch" style={{ flex: 1 }} returnKeyType="done" onSubmitEditing={submit} accessibilityLabel="New punch list item" />
        <IconButton theme={theme} solid glyph="plus" label="Add item" onPress={submit} size={50} />
      </View>
      {!pro && items.length === 0 ? <Hint theme={theme}>Punch lists are part of Pro.</Hint> : null}
      {items.length ? <Text style={[type.label, { color: theme.inkSoft }]}>{punchSummary(items)}</Text> : null}
      {items.length ? (
        <Card theme={theme}>
          {ordered(items).map((it, i) => {
            const done = it.status === 'done';
            const n = counts.get(it.id) ?? 0;
            return (
              <View key={it.id} style={[styles.punchRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.rule }]}>
                <Press onPress={() => onToggle(it)} style={[styles.check, { borderColor: done ? theme.good : theme.ink, backgroundColor: done ? theme.good : theme.card }]} accessibilityRole="checkbox" accessibilityState={{ checked: done }} accessibilityLabel={it.title}>
                  {done ? <Glyph name="check" size={20} color="#FFFFFF" weight={2.6} /> : null}
                </Press>
                <Press onPress={() => onOpen(it)} style={{ flex: 1, paddingVertical: space.s }} accessibilityRole="button" accessibilityLabel={`Edit ${it.title}`}>
                  <Text style={[type.body, { color: done ? theme.inkSoft : theme.ink, textDecorationLine: done ? 'line-through' : 'none' }]}>{it.title}</Text>
                  {it.note ? <Text style={[type.small, { color: theme.inkSoft }]} numberOfLines={2}>{it.note}</Text> : null}
                  {n ? <Text style={[type.small, { color: theme.inkFaint }]}>{n === 1 ? '1 photo' : `${n} photos`}</Text> : null}
                </Press>
                <IconButton theme={theme} glyph="camera" label={`Photo for ${it.title}`} onPress={() => onShoot(it)} />
              </View>
            );
          })}
        </Card>
      ) : (
        <Hint theme={theme}>Add what is left to do. Tick each item off as the work is done, and attach photos as proof.</Hint>
      )}
    </View>
  );
}

function ItemSheet({ theme, item, photos, onClose, onSave, onDelete, onMove, onPhoto, onShoot }: { theme: Theme; item: PunchItem | null; photos: Photo[]; onClose: () => void; onSave: (i: PunchItem) => void; onDelete: (i: PunchItem) => void; onMove: (i: PunchItem, dir: -1 | 1) => void; onPhoto: (id: string) => void; onShoot: (i: PunchItem) => void }) {
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => {
    setTitle(item?.title ?? '');
    setNote(item?.note ?? '');
  }, [item]);
  return (
    <Sheet theme={theme} visible={item != null} onClose={onClose} title="Punch list item">
      {item ? (
        <View style={{ gap: space.l, paddingBottom: space.s }}>
          <Card theme={theme}>
            <InputLine theme={theme} first label="Item" value={title} onChangeText={setTitle} />
            <InputLine theme={theme} label="Note" value={note} onChangeText={setNote} multiline placeholder="Optional" />
          </Card>
          <View style={styles.grid}>
            {photos.map((p) => (
              <Press key={p.id} onPress={() => onPhoto(p.id)} accessibilityRole="button" accessibilityLabel="Open photo">
                <Image source={{ uri: uriOf(p.thumb) }} style={{ width: 72, height: 72, borderRadius: radius.chip }} />
              </Press>
            ))}
            <Press onPress={() => onShoot(item)} style={[styles.addPhoto, { borderColor: theme.ink }]} accessibilityRole="button" accessibilityLabel="Take a photo for this item">
              <Glyph name="camera" size={24} color={theme.ink} />
            </Press>
          </View>
          <View style={{ flexDirection: 'row', gap: space.s }}>
            <PlainButton theme={theme} glyph="up" label="Up" grow onPress={() => onMove(item, -1)} />
            <PlainButton theme={theme} glyph="down" label="Down" grow onPress={() => onMove(item, 1)} />
          </View>
          <GoButton theme={theme} label="Save" onPress={() => onSave({ ...item, title: title.trim() || item.title, note: note.trim() })} />
          <PlainButton theme={theme} tone="danger" glyph="trash" label="Delete item" onPress={() => onDelete(item)} />
          <Hint theme={theme}>Deleting an item keeps its photos in the job.</Hint>
        </View>
      ) : null}
    </Sheet>
  );
}

// ---------- job details ----------

export function JobSheet({ theme, visible, job, onClose, onSave }: { theme: Theme; visible: boolean; job: JobT; onClose: () => void; onSave: (j: JobT) => void }) {
  const [j, setJ] = useState(job);
  useEffect(() => {
    if (visible) setJ(job);
  }, [visible, job]);
  return (
    <Sheet theme={theme} visible={visible} onClose={onClose} title="Job">
      <View style={{ gap: space.l, paddingBottom: space.s }}>
        <Card theme={theme}>
          <InputLine theme={theme} first label="Name" value={j.name} onChangeText={(name) => setJ({ ...j, name })} autoCapitalize="words" />
          <InputLine theme={theme} label="Client" value={j.client} onChangeText={(client) => setJ({ ...j, client })} autoCapitalize="words" />
          <InputLine theme={theme} label="Address" value={j.address} onChangeText={(address) => setJ({ ...j, address })} />
          <InputLine theme={theme} label="Notes" value={j.notes} onChangeText={(notes) => setJ({ ...j, notes })} multiline />
        </Card>
        <Hint theme={theme}>The name prints on the stamp. The client, address and notes go on the report.</Hint>
        <GoButton theme={theme} label="Save" onPress={() => onSave(j)} disabled={!j.name.trim()} />
      </View>
    </Sheet>
  );
}

/** The list of every job, newest work first. */
export function Jobs({ onBack, onOpen }: { onBack: () => void; onOpen: (id: string) => void }) {
  const theme = useTheme();
  const app = useApp();
  const data = useData();
  const [naming, setNaming] = useState(false);
  const empty: JobT = { id: '', name: '', address: '', client: '', notes: '', createdAt: 0, updatedAt: 0 };
  const add = () => {
    if (!canAddJob(app.isPro, data.jobs.length)) app.askPro('job').then((ok) => ok && setTimeout(() => setNaming(true), 350));
    else setNaming(true);
  };
  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <Header theme={theme} title="Jobs" onBack={onBack} glyph="camera" right={<IconButton theme={theme} glyph="plus" label="New job" onPress={add} />} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {data.jobs.length === 0 ? (
          <Card theme={theme} style={{ padding: space.l, gap: space.s }}>
            <Text style={[type.strong, { color: theme.ink }]}>No jobs yet.</Text>
            <Text style={[type.body, { color: theme.inkSoft }]}>Your first photo starts Job 1. Rename it any time.</Text>
          </Card>
        ) : (
          <Card theme={theme}>
            {data.jobs.map((j, i) => (
              <Line
                key={j.id}
                theme={theme}
                first={i === 0}
                label={jobLabel(j)}
                sub={[j.client, photoCount(j.photoCount), j.openItems ? `${j.openItems} open` : ''].filter(Boolean).join(', ')}
                onPress={() => onOpen(j.id)}
                left={j.lastThumb ? <Image source={{ uri: uriOf(j.lastThumb) }} style={styles.listThumb} /> : <View style={[styles.listThumb, { backgroundColor: theme.well, alignItems: 'center', justifyContent: 'center' }]}><Glyph name="jobs" size={22} color={theme.inkFaint} /></View>}
                right={j.id === data.currentJobId ? <Tag theme={theme} kind="plain" label="Camera" /> : undefined}
              />
            ))}
          </Card>
        )}
        {!app.isPro && data.jobs.length >= 1 ? <Hint theme={theme}>One job is free. Pro keeps as many as you need.</Hint> : null}
      </ScrollView>
      <JobSheet
        theme={theme}
        visible={naming}
        job={empty}
        onClose={() => setNaming(false)}
        onSave={async (j) => {
          const made = await data.createJob(j);
          setNaming(false);
          onOpen(made.id);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: space.s, paddingHorizontal: space.l, paddingBottom: space.m, flexWrap: 'wrap' },
  scroll: { padding: space.l, paddingTop: space.s, gap: space.l, paddingBottom: space.xxl * 2 },
  dayHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: space.s },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  thumbTag: { position: 'absolute', left: 4, bottom: 4 },
  pairTag: { position: 'absolute', left: 6, top: 6 },
  takeAfter: { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: radius.chip, alignItems: 'center', justifyContent: 'center', gap: space.xs },
  punchRow: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingLeft: space.l, paddingRight: space.xs, minHeight: 60 },
  check: { width: 32, height: 32, borderRadius: 7, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  addPhoto: { width: 72, height: 72, borderRadius: radius.chip, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  bottom: { paddingHorizontal: space.l, paddingTop: space.m, borderTopWidth: StyleSheet.hairlineWidth },
  listThumb: { width: 52, height: 52, borderRadius: radius.chip },
});
