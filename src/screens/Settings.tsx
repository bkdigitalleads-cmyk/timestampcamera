import React, { useEffect, useRef, useState } from 'react';
import { Alert, Image, Linking, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Skia } from '@shopify/react-native-skia';
import { useTheme, radius, space, type } from '../theme';
import { useData } from '../data';
import { useApp } from '../state';
import { restorePurchases } from '../purchases';
import { cancelTrialReminder } from '../reminder';
import { askPhotosAccess } from '../capture';
import { readUri, uriOf, writeRel } from '../store';
import { ONBOARDED_KEY } from '../state';
import { PRIVACY_URL, SUPPORT_EMAIL, SUPPORT_MAIL_URL, SUPPORT_URL, TERMS_URL } from '../links';
import { Card, FieldLabel, Header, Hint, InputLine, Line, SwitchLine } from '../ui/Site';

/**
 * Settings: your company and logo, the camera, Pro and restore, help and
 * About. The test tools are behind seven taps on the version line, in test
 * builds only (development, or a sandbox purchase, which is what TestFlight
 * purchases are).
 */
export default function Settings({ onBack, onStamp, onReplayOnboarding }: { onBack: () => void; onStamp: () => void; onReplayOnboarding: () => void }) {
  const theme = useTheme();
  const data = useData();
  const { isPro, setIsPro, askPro, testBuild, actFree, setActFree, resetFreeReports, say, setCameraOpen } = useApp();
  const [company, setCompany] = useState(data.company);
  const [restoring, setRestoring] = useState(false);
  const [taps, setTaps] = useState(0);
  const [locationOn, setLocationOn] = useState<boolean | null>(null);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const version = `${Constants.expoConfig?.version ?? '1.0.0'} (${Constants.expoConfig?.ios?.buildNumber ?? '1'})`;

  useEffect(() => setCameraOpen(false), [setCameraOpen]);
  useEffect(() => {
    Location.getForegroundPermissionsAsync()
      .then((p) => setLocationOn(p.granted))
      .catch(() => setLocationOn(false));
  }, []);

  const restore = async () => {
    if (restoring) return;
    setRestoring(true);
    const res = await restorePurchases();
    setRestoring(false);
    if (res.ok) cancelTrialReminder();
    if (res.ok && res.isPro) {
      setIsPro(true);
      Alert.alert('Pro is back on', 'Every job, every report, pairs, punch lists and your logo on the stamp.');
    } else if (res.ok) Alert.alert('Nothing to restore', 'This Apple ID has no Timestamp Camera Pro purchase.');
    else Alert.alert('Restore did not work', res.error ?? 'Try once more.');
  };

  const pickLogo = async () => {
    // The system photo picker: no Photos permission is asked for.
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsEditing: false });
    if (res.canceled || !res.assets?.[0]) return;
    try {
      const img = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(readUri(res.assets[0].uri)));
      if (!img) throw new Error('That picture could not be read.');
      // At most 512 px on the long side, as PNG so a clear background stays clear.
      const k = Math.min(1, 512 / Math.max(img.width(), img.height()));
      const w = Math.max(1, Math.round(img.width() * k));
      const h = Math.max(1, Math.round(img.height() * k));
      const surface = Skia.Surface.Make(w, h);
      if (!surface) throw new Error('Not enough memory for the logo.');
      surface.getCanvas().drawImageRectOptions(img, Skia.XYWHRect(0, 0, img.width(), img.height()), Skia.XYWHRect(0, 0, w, h), 1, 2, Skia.Paint());
      surface.flush();
      const png = surface.makeImageSnapshot().encodeToBytes(4 as never);
      const file = `logo/logo-${Date.now().toString(36)}.png`;
      writeRel(file, png);
      await data.saveLogo({ file, width: w, height: h });
      say('Logo saved');
    } catch (e: any) {
      Alert.alert('The logo was not saved', e?.message ?? 'Try another picture.');
    }
  };

  const versionTap = () => {
    if (!testBuild) return;
    if (tapTimer.current) clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => setTaps(0), 2000);
    setTaps((t) => t + 1);
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <Header theme={theme} title="Settings" onBack={onBack} glyph="camera" />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View>
          <FieldLabel theme={theme}>Your company</FieldLabel>
          <Card theme={theme}>
            <InputLine theme={theme} first label="Name" value={company} onChangeText={setCompany} onBlur={() => data.saveCompany(company)} onSubmitEditing={() => data.saveCompany(company)} placeholder="Reyes Home Repair" autoCapitalize="words" returnKeyType="done" />
            <Line
              theme={theme}
              label={data.logo ? 'Change logo' : 'Add logo'}
              sub="From your photos. A PNG with a clear background looks best."
              onPress={pickLogo}
              right={data.logo ? <Image source={{ uri: uriOf(data.logo.file) }} style={styles.logo} resizeMode="contain" /> : undefined}
            />
            {data.logo ? <Line theme={theme} tone="danger" label="Remove logo" onPress={() => data.saveLogo(null)} right={<View />} /> : null}
          </Card>
          <Hint theme={theme} style={styles.hint}>Both go on your reports. On the stamp, the name and logo are part of Pro.</Hint>
        </View>

        <View>
          <FieldLabel theme={theme}>Camera</FieldLabel>
          <Card theme={theme}>
            <Line theme={theme} first glyph="stamp" label="Stamp" sub="Template, corner, size and lines" onPress={onStamp} />
            <SwitchLine
              theme={theme}
              label="Save copies to Photos"
              sub="Each stamped photo also goes to your Photos library"
              value={data.saveToPhotos}
              onValue={async (v) => {
                if (v && !(await askPhotosAccess())) {
                  Alert.alert('Photos said no', 'Allow adding photos for Timestamp Camera in Settings, Privacy, Photos.', [
                    { text: 'Not now', style: 'cancel' },
                    { text: 'Open Settings', onPress: () => Linking.openSettings().catch(() => {}) },
                  ]);
                  return;
                }
                data.setSaveToPhotos(v);
              }}
            />
            <Line theme={theme} glyph="pin" label={locationOn ? 'Location is on' : 'Location is off'} sub={locationOn ? 'Only while the app is open' : 'The stamp shows the date and time only'} onPress={() => Linking.openSettings().catch(() => {})} />
          </Card>
        </View>

        <View>
          <FieldLabel theme={theme}>Pro</FieldLabel>
          <Card theme={theme}>
            {isPro ? <Line theme={theme} first glyph="check" label="Timestamp Camera Pro is on" sub="Every job and report, pairs, punch lists, your logo on the stamp" /> : <Line theme={theme} first glyph="star" label="Timestamp Camera Pro" sub="Every job and report, pairs, punch lists, your logo on the stamp" onPress={() => askPro('pro')} />}
            <Line theme={theme} glyph="restore" label={restoring ? 'Restoring' : 'Restore purchases'} onPress={restore} right={<View />} />
          </Card>
        </View>

        <View>
          <FieldLabel theme={theme}>Help</FieldLabel>
          <Card theme={theme}>
            <Line theme={theme} first label="Support" sub="How the stamp, jobs and reports work" onPress={() => Linking.openURL(SUPPORT_URL)} />
            <Line theme={theme} label="Email support" sub={SUPPORT_EMAIL} onPress={() => Linking.openURL(SUPPORT_MAIL_URL).catch(() => Alert.alert('Mail did not open', `Write to ${SUPPORT_EMAIL}.`))} />
            <Line theme={theme} label="Privacy Policy" onPress={() => Linking.openURL(PRIVACY_URL)} />
            <Line theme={theme} label="Terms of Use (EULA)" onPress={() => Linking.openURL(TERMS_URL)} />
          </Card>
        </View>

        <View>
          <FieldLabel theme={theme}>About</FieldLabel>
          <Card theme={theme} style={styles.about}>
            <Text style={[type.body, { color: theme.ink }]}>Job photos with the date, time and place printed on them, filed by job.</Text>
            <Text style={[type.small, { color: theme.inkSoft }]}>No account and no server of ours. Photos and reports stay on this iPhone until you share them. The street address on the stamp is looked up by Apple’s location service, which receives the coordinates; with the Address line off, no lookup is made. The stamp prints your phone’s own clock and location.</Text>
            <Text style={[type.small, { color: theme.inkFaint, paddingVertical: space.s }]} onPress={versionTap} accessibilityRole="text">
              Version {version}
            </Text>
          </Card>
        </View>

        {testBuild && taps >= 7 ? (
          <View>
            <FieldLabel theme={theme}>Testing (test builds only)</FieldLabel>
            <Card theme={theme}>
              <Line theme={theme} first label="Act as a free user" right={<Switch value={actFree} onValueChange={(v) => setActFree(v)} />} />
              <Line theme={theme} label="Make the first report free again" onPress={() => { resetFreeReports(); say('Free report reset.'); }} right={<View />} />
              <Line
                theme={theme}
                label="Show onboarding again"
                onPress={() => {
                  data.kvSet(ONBOARDED_KEY, '0').catch(() => {});
                  onReplayOnboarding();
                }}
                right={<View />}
              />
            </Card>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: space.l, gap: space.xl, paddingBottom: space.xxl * 2 },
  hint: { marginTop: space.s },
  logo: { width: 44, height: 44, borderRadius: radius.chip },
  about: { padding: space.l, gap: space.s },
});
