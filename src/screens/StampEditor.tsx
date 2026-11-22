/**
 * The stamp editor: the stamp live on a photo at the top, then the
 * template, the corner, the size, each line, the note and the clock. Every
 * line is free except the company name, the logo and the map (Pro).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useTheme, radius, space, type } from '../theme';
import { useApp } from '../state';
import { useData } from '../data';
import { useLocation } from '../camera/useLocation';
import StampLayer, { useSkImage, useStampFont } from '../ui/StampLayer';
import { CORNERS, Corner, SIZES, stampLines, StampSettings, StampShow, TEMPLATES } from '../stamp/content';
import { formatDate, partsOf } from '../stamp/format';
import { readRel } from '../store';
import type { ProFeature } from '../gates';
import { Card, Chip, FieldLabel, Header, Hint, Input, SwitchLine } from '../ui/Site';
import { tick } from '../ui/motion';

const SAMPLE = require('../../assets/sample/site.jpg');

const CORNER_LABEL: Record<Corner, string> = { topLeft: 'Top left', topRight: 'Top right', bottomLeft: 'Bottom left', bottomRight: 'Bottom right' };

const LINES: { key: keyof StampShow; label: string; sub?: string; pro?: ProFeature }[] = [
  { key: 'date', label: 'Date' },
  { key: 'time', label: 'Time' },
  { key: 'address', label: 'Address', sub: 'Looked up by Apple’s location service, which receives the coordinates. Off: no lookup. No signal: the coordinates print instead.' },
  { key: 'coords', label: 'Latitude and longitude' },
  { key: 'altitude', label: 'Altitude', sub: 'Full template' },
  { key: 'job', label: 'Job name' },
  { key: 'note', label: 'Note' },
  { key: 'company', label: 'Company name', sub: 'Full template. Set it in Settings.', pro: 'company' },
  { key: 'logo', label: 'Logo', sub: 'Standard and Full. Add it in Settings.', pro: 'logo' },
  { key: 'map', label: 'Map of the spot', sub: 'Full template. The map picture loads from Apple Maps for that spot.', pro: 'map' },
];

export default function StampEditor({ onBack }: { onBack: () => void }) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const app = useApp();
  const data = useData();
  const [s, setS] = useState<StampSettings>(data.stamp);
  const loc = useLocation(true, s.show.address);
  const font = useStampFont();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => app.setCameraOpen(false), [app]);

  const save = (next: StampSettings) => {
    setS(next);
    data.saveStamp(next);
  };
  const set = <K extends keyof StampSettings>(k: K, v: StampSettings[K]) => {
    tick();
    save({ ...s, [k]: v });
  };
  const show = (k: keyof StampShow, v: boolean, pro?: ProFeature) => {
    if (v && pro && !app.isPro) {
      app.askPro(pro);
      return;
    }
    save({ ...s, show: { ...s.show, [k]: v } });
  };

  const job = data.currentJob;
  const content = useMemo(
    () => stampLines(s, { time: now, place: loc.place, jobName: job?.name || 'Job 1', company: data.company || 'Your company', pro: app.isPro, hasLogo: data.logo != null }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [s, Math.floor(now / 1000), loc.place?.lat, loc.place?.address, job?.name, data.company, app.isPro, data.logo]
  );
  const logoBytes = useMemo(() => {
    try {
      return data.logo ? readRel(data.logo.file) : null;
    } catch {
      return null;
    }
  }, [data.logo]);
  const logoImg = useSkImage(logoBytes);

  const w = width - space.l * 2;
  const h = Math.round((w * 4) / 3);
  // A plain sample photo (the job's own photos already carry their stamps).
  const backdrop = SAMPLE;
  const p = partsOf(now);

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <Header theme={theme} title="Stamp" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.preview, { width: w, height: h }]} accessible accessibilityRole="image" accessibilityLabel={`The stamp: ${content.lines.join('. ')}`}>
          <Image source={backdrop} style={StyleSheet.absoluteFill} resizeMode="cover" />
          <StampLayer width={w} height={h} content={content} settings={s} logo={logoImg} map={null} typeface={font} />
        </View>
        {content.map ? <Hint theme={theme}>The map shows on photos taken with signal; this preview leaves it out.</Hint> : null}
        {loc.access !== 'granted' ? <Hint theme={theme}>Location is off, so the stamp shows the date and time only.</Hint> : null}

        <View>
          <FieldLabel theme={theme}>Template</FieldLabel>
          <View style={styles.chips}>
            {TEMPLATES.map((t) => (
              <Chip key={t.id} theme={theme} label={t.label} on={s.template === t.id} onPress={() => set('template', t.id)} />
            ))}
          </View>
          <Hint theme={theme} style={{ marginTop: space.s }}>{TEMPLATES.find((t) => t.id === s.template)?.sub}</Hint>
        </View>

        <View>
          <FieldLabel theme={theme}>Corner</FieldLabel>
          <View style={styles.grid}>
            {CORNERS.map((c) => (
              <View key={c} style={styles.half}>
                <Chip theme={theme} label={CORNER_LABEL[c]} on={s.corner === c} onPress={() => set('corner', c)} />
              </View>
            ))}
          </View>
        </View>

        <View>
          <FieldLabel theme={theme}>Size</FieldLabel>
          <View style={styles.chips}>
            {SIZES.map((z) => (
              <Chip key={z.id} theme={theme} label={z.label} on={s.size === z.id} onPress={() => set('size', z.id)} />
            ))}
          </View>
        </View>

        <View>
          <FieldLabel theme={theme}>Lines</FieldLabel>
          <Card theme={theme}>
            {LINES.map((l, i) => (
              <SwitchLine key={l.key} theme={theme} first={i === 0} label={l.label} sub={l.sub} value={s.show[l.key] && (!l.pro || app.isPro)} locked={!!l.pro && !app.isPro} onValue={(v) => show(l.key, v, l.pro)} />
            ))}
          </Card>
        </View>

        <View>
          <FieldLabel theme={theme}>Note</FieldLabel>
          <Input theme={theme} value={s.note} onChangeText={(note) => save({ ...s, note: note.slice(0, 120) })} placeholder="Like Kitchen subfloor, east wall" maxLength={120} accessibilityLabel="Note on the stamp" />
          <Hint theme={theme} style={{ marginTop: space.s }}>Prints on every photo until you change it.</Hint>
        </View>

        <View>
          <FieldLabel theme={theme}>Time and date</FieldLabel>
          <View style={styles.chips}>
            <Chip theme={theme} label="12 hour" on={s.clock === '12'} onPress={() => set('clock', '12')} />
            <Chip theme={theme} label="24 hour" on={s.clock === '24'} onPress={() => set('clock', '24')} />
          </View>
          <Card theme={theme} style={{ marginTop: space.m }}>
            <SwitchLine theme={theme} first label="Seconds" value={s.seconds} onValue={(v) => set('seconds', v)} />
          </Card>
          <View style={[styles.chips, { marginTop: space.m }]}>
            {(['mdy', 'dmy', 'ymd'] as const).map((d) => (
              <Chip key={d} theme={theme} label={formatDate(p, d)} on={s.dateStyle === d} onPress={() => set('dateStyle', d)} />
            ))}
          </View>
          <View style={[styles.chips, { marginTop: space.m }]}>
            <Chip theme={theme} label="Feet" on={s.units === 'ft'} onPress={() => set('units', 'ft')} />
            <Chip theme={theme} label="Meters" on={s.units === 'm'} onPress={() => set('units', 'm')} />
          </View>
        </View>
        <Text style={[type.small, { color: theme.inkSoft }]}>The stamp prints your phone’s clock and location as they were when you took the photo.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: space.l, gap: space.xl, paddingBottom: space.xxl * 2 },
  preview: { borderRadius: radius.card, overflow: 'hidden', backgroundColor: '#000' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  half: { width: '48.5%' },
});
