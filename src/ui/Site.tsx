/**
 * The component kit ("site board"). Names are this app's own:
 *  - Press: everything tappable, with a pressed state; targets 44 pt or more
 *  - GoButton: the one main action, hi-vis yellow with ink lettering
 *  - PlainButton: a white button with an ink edge
 *  - IconButton: a round glyph button, on light screens or on camera chrome
 *  - Chip: a choice in a row (template, corner, size); picked is solid ink
 *  - Card / Line: a white card and the rows inside it
 *  - Heading / Hint / FieldLabel: words
 *  - Input / SwitchLine: fields
 *  - Header: back, a title, an action
 *  - Tag: Open, Done, Before, After, Imported
 *  - Sheet: a drawer from the bottom
 *  - Toast: one short line for a few seconds ("Saved to Miller kitchen")
 */
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, KeyboardAvoidingView, Modal, Pressable, PressableProps, ScrollView, StyleProp, StyleSheet, Switch, Text, TextInput, TextInputProps, TextStyle, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MAIN_BUTTON, Theme, radius, space, type } from '../theme';
import Glyph, { GlyphName } from './Glyph';
import { MODAL_ANIMATION } from './motion';

export function Press({
  style,
  pressedStyle,
  children,
  ...rest
}: Omit<PressableProps, 'style' | 'children'> & { style?: StyleProp<ViewStyle>; pressedStyle?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  return (
    <Pressable {...rest} style={({ pressed }) => [style, pressed && (pressedStyle ?? { opacity: 0.55 })]}>
      {children}
    </Pressable>
  );
}

/** The main action. One per screen. */
export function GoButton({ theme, label, onPress, disabled = false, busy = false, hint, glyph }: { theme: Theme; label: string; onPress: () => void; disabled?: boolean; busy?: boolean; hint?: string; glyph?: GlyphName }) {
  const off = disabled || busy;
  return (
    <Press
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: off, busy }}
      style={[styles.go, { backgroundColor: theme.accent, borderBottomColor: theme.accentEdge, opacity: disabled ? 0.4 : 1 }]}
      pressedStyle={{ transform: [{ translateY: 1 }], borderBottomWidth: 2 }}
    >
      {busy ? (
        <ActivityIndicator color={theme.onAccent} />
      ) : (
        <View style={styles.row}>
          {glyph ? <Glyph name={glyph} size={22} color={theme.onAccent} weight={2.2} /> : null}
          <Text style={[type.button, { color: theme.onAccent }]} maxFontSizeMultiplier={1.3} numberOfLines={1}>
            {label}
          </Text>
        </View>
      )}
    </Press>
  );
}

export function PlainButton({ theme, label, onPress, glyph, disabled = false, tone = 'ink', grow = false, hint }: { theme: Theme; label: string; onPress: () => void; glyph?: GlyphName; disabled?: boolean; tone?: 'ink' | 'danger'; grow?: boolean; hint?: string }) {
  const color = tone === 'danger' ? theme.danger : theme.ink;
  return (
    <Press
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled }}
      style={[styles.plain, grow && { flex: 1 }, { backgroundColor: theme.card, borderColor: tone === 'danger' ? theme.danger : theme.ink, opacity: disabled ? 0.4 : 1 }]}
      pressedStyle={{ backgroundColor: theme.well }}
    >
      {glyph ? <Glyph name={glyph} size={20} color={color} /> : null}
      <Text style={[type.body, { color, fontWeight: '600' }]} maxFontSizeMultiplier={1.4} numberOfLines={1}>
        {label}
      </Text>
    </Press>
  );
}

/** A round glyph-only button. Always has a label for VoiceOver. `dark` is for the camera chrome. */
export function IconButton({ theme, glyph, label, onPress, disabled = false, color, size = 48, dark = false, solid = false, badge }: { theme: Theme; glyph: GlyphName; label: string; onPress: () => void; disabled?: boolean; color?: string; size?: number; dark?: boolean; solid?: boolean; badge?: boolean }) {
  return (
    <Press
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      hitSlop={size < 44 ? (44 - size) / 2 : 0}
      style={[styles.icon, { width: size, height: size, opacity: disabled ? 0.3 : 1 }, solid && { backgroundColor: dark ? theme.chromeRaised : theme.card, borderWidth: dark ? 0 : 1, borderColor: theme.edge }]}
      pressedStyle={{ backgroundColor: dark ? theme.chromeRaised : theme.well }}
    >
      <Glyph name={glyph} size={Math.round(size * 0.52)} color={color ?? (dark ? theme.chromeInk : theme.ink)} />
      {badge ? <View style={[styles.badge, { backgroundColor: theme.accent }]} /> : null}
    </Press>
  );
}

/** A choice in a row. Picked: solid ink with white lettering. Locked: a small lock (Pro). */
export function Chip({ theme, label, on, onPress, locked = false, glyph, dark = false }: { theme: Theme; label: string; on: boolean; onPress: () => void; locked?: boolean; glyph?: GlyphName; dark?: boolean }) {
  const fg = on ? (dark ? theme.ink : theme.card) : dark ? theme.chromeInk : theme.ink;
  const bg = on ? (dark ? theme.chromeInk : theme.ink) : dark ? theme.chromeRaised : theme.card;
  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={locked ? `${label}, Pro` : label}
      accessibilityState={{ selected: on }}
      style={[styles.chip, { backgroundColor: bg, borderColor: on ? bg : dark ? theme.chromeRaised : theme.edge }]}
      pressedStyle={{ opacity: 0.7 }}
    >
      {glyph ? <Glyph name={glyph} size={18} color={fg} /> : null}
      <Text style={[type.small, { color: fg, fontWeight: '600' }]} maxFontSizeMultiplier={1.4} numberOfLines={1}>
        {label}
      </Text>
      {locked ? <Glyph name="lock" size={14} color={on ? fg : dark ? theme.chromeSoft : theme.inkFaint} /> : null}
    </Press>
  );
}

export function Card({ theme, children, style }: { theme: Theme; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.edge }, style]}>{children}</View>;
}

/** A row inside a Card. */
export function Line({ theme, label, sub, onPress, glyph, right, first = false, tone = 'ink', hint, left }: { theme: Theme; label: string; sub?: string; onPress?: () => void; glyph?: GlyphName; right?: React.ReactNode; first?: boolean; tone?: 'ink' | 'danger'; hint?: string; left?: React.ReactNode }) {
  const color = tone === 'danger' ? theme.danger : theme.ink;
  const body = (
    <>
      {left ?? (glyph ? <Glyph name={glyph} size={22} color={color} /> : null)}
      <View style={{ flex: 1 }}>
        <Text style={[type.body, { color }]}>{label}</Text>
        {sub ? <Text style={[type.small, { color: theme.inkSoft }]}>{sub}</Text> : null}
      </View>
      {right ?? (onPress ? <Glyph name="chevron" size={18} color={theme.inkFaint} /> : null)}
    </>
  );
  const st = [styles.line, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.rule }];
  if (!onPress)
    return (
      <View style={st} accessible accessibilityLabel={sub ? `${label}. ${sub}` : label}>
        {body}
      </View>
    );
  return (
    <Press onPress={onPress} style={st} pressedStyle={{ backgroundColor: theme.well }} accessibilityRole="button" accessibilityLabel={sub ? `${label}. ${sub}` : label} accessibilityHint={hint}>
      {body}
    </Press>
  );
}

export function SwitchLine({ theme, label, sub, value, onValue, first = false, locked = false }: { theme: Theme; label: string; sub?: string; value: boolean; onValue: (v: boolean) => void; first?: boolean; locked?: boolean }) {
  return (
    <View style={[styles.line, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.rule }]}>
      <View style={{ flex: 1 }}>
        <View style={styles.row}>
          <Text style={[type.body, { color: theme.ink }]}>{label}</Text>
          {locked ? <Glyph name="lock" size={15} color={theme.inkFaint} /> : null}
        </View>
        {sub ? <Text style={[type.small, { color: theme.inkSoft }]}>{sub}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onValue} trackColor={{ true: theme.ink, false: theme.well }} accessibilityLabel={locked ? `${label}, Pro` : label} />
    </View>
  );
}

export function Heading({ theme, children, style }: { theme: Theme; children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return (
    <Text style={[type.title, { color: theme.ink }, style]} accessibilityRole="header" maxFontSizeMultiplier={1.4}>
      {children}
    </Text>
  );
}

export function Hint({ theme, children, style }: { theme: Theme; children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[type.small, { color: theme.inkSoft }, style]}>{children}</Text>;
}

/** Condensed capitals over a group. */
export function FieldLabel({ theme, children, right }: { theme: Theme; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={styles.labelRow}>
      <Text style={[type.label, { color: theme.inkSoft, flex: 1 }]} accessibilityRole="header" maxFontSizeMultiplier={1.4}>
        {children}
      </Text>
      {right}
    </View>
  );
}

export function Input({ theme, style, ...rest }: TextInputProps & { theme: Theme }) {
  return <TextInput placeholderTextColor={theme.inkFaint} selectionColor={theme.ink} {...rest} style={[type.body, styles.input, { color: theme.ink, backgroundColor: theme.card, borderColor: theme.edge }, style]} />;
}

/** A labelled field inside a Card. */
export function InputLine({ theme, label, first = false, multiline, ...rest }: TextInputProps & { theme: Theme; label: string; first?: boolean }) {
  return (
    <View style={[styles.inputLine, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.rule }, multiline && { alignItems: 'flex-start' }]}>
      <Text style={[type.body, styles.inputLabel, { color: theme.inkSoft }, multiline && { paddingTop: space.m }]}>{label}</Text>
      <TextInput placeholderTextColor={theme.inkFaint} selectionColor={theme.ink} accessibilityLabel={label} multiline={multiline} {...rest} style={[type.body, styles.inputField, { color: theme.ink }, multiline && { minHeight: 88, textAlignVertical: 'top', paddingTop: space.m }]} />
    </View>
  );
}

export function Header({ theme, title, onBack, glyph = 'back', right, sub }: { theme: Theme; title?: string; onBack?: () => void; glyph?: GlyphName; right?: React.ReactNode; sub?: string }) {
  return (
    <View style={styles.header}>
      <View style={styles.side}>{onBack ? <IconButton theme={theme} glyph={glyph} label={glyph === 'close' ? 'Close' : 'Back'} onPress={onBack} /> : null}</View>
      <View style={{ flex: 1, alignItems: 'center' }}>
        {title ? (
          <Text style={[type.strong, { color: theme.ink }]} numberOfLines={1} accessibilityRole="header" maxFontSizeMultiplier={1.3}>
            {title}
          </Text>
        ) : null}
        {sub ? (
          <Text style={[type.small, { color: theme.inkSoft }]} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      <View style={[styles.side, { alignItems: 'flex-end' }]}>{right}</View>
    </View>
  );
}

export type TagKind = 'open' | 'done' | 'before' | 'after' | 'imported' | 'plain';

/** A small capitalised tag. Done is green, Before and After are ink, Imported is outlined. */
export function Tag({ theme, kind, label }: { theme: Theme; kind: TagKind; label: string }) {
  const solid = kind === 'done' ? theme.good : kind === 'before' || kind === 'after' ? theme.ink : null;
  return (
    <View style={[styles.tag, solid ? { backgroundColor: solid, borderColor: solid } : { borderColor: kind === 'open' ? theme.ink : theme.inkFaint }]}>
      <Text style={[type.label, { fontSize: 12, lineHeight: 14, color: solid ? '#FFFFFF' : kind === 'open' ? theme.ink : theme.inkSoft }]} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
    </View>
  );
}

/** One short line near the top for a few seconds. `dark` over the camera. */
export function Toast({ theme, text, top, dark = false }: { theme: Theme; text: string | null; top: number; dark?: boolean }) {
  const fade = useRef(new Animated.Value(0)).current;
  const last = useRef(text);
  if (text) last.current = text;
  useEffect(() => {
    Animated.timing(fade, { toValue: text ? 1 : 0, duration: 160, useNativeDriver: true }).start();
  }, [text, fade]);
  return (
    <Animated.View pointerEvents="none" style={[styles.toast, { top: top + space.s, opacity: fade, backgroundColor: dark ? theme.chromeInk : theme.ink }]} accessibilityLiveRegion="polite">
      <Text style={[type.strong, { color: dark ? theme.ink : theme.card, textAlign: 'center' }]}>{last.current}</Text>
    </Animated.View>
  );
}

/** A drawer from the bottom over a dimmed screen. */
export function Sheet({ theme, visible, onClose, children, title }: { theme: Theme; visible: boolean; onClose: () => void; children: React.ReactNode; title?: string }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType={MODAL_ANIMATION} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: theme.scrim }]} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
        <View style={[styles.sheet, { backgroundColor: theme.bg, paddingBottom: Math.max(insets.bottom, space.l) }]}>
          <View style={styles.sheetHead}>
            <Text style={[type.heading, { color: theme.ink, flex: 1 }]} accessibilityRole="header">
              {title ?? ''}
            </Text>
            <IconButton theme={theme} glyph="close" label="Close" onPress={onClose} />
          </View>
          <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  go: { minHeight: MAIN_BUTTON, borderRadius: radius.card, borderBottomWidth: 3, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  plain: { minHeight: 50, borderRadius: radius.card, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.s, paddingHorizontal: space.l },
  icon: { borderRadius: radius.round, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 8, right: 8, width: 9, height: 9, borderRadius: radius.round },
  chip: { minHeight: 44, borderRadius: radius.chip, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.m },
  card: { borderRadius: radius.card, borderWidth: 1, overflow: 'hidden' },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.m, minHeight: 56, paddingHorizontal: space.l, paddingVertical: space.m },
  labelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: space.s, minHeight: 20 },
  input: { minHeight: 50, borderRadius: radius.chip, borderWidth: 1, paddingHorizontal: space.m },
  inputLine: { flexDirection: 'row', alignItems: 'center', minHeight: 54, paddingLeft: space.l, paddingRight: space.s },
  inputLabel: { width: 92 },
  inputField: { flex: 1, minHeight: 52, paddingHorizontal: space.s },
  header: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: space.xs },
  side: { minWidth: 96 },
  tag: { borderWidth: 1.2, borderRadius: radius.chip - 3, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start' },
  toast: { position: 'absolute', left: space.xl, right: space.xl, borderRadius: radius.chip, paddingVertical: space.m, paddingHorizontal: space.l },
  sheet: { borderTopLeftRadius: radius.card + 4, borderTopRightRadius: radius.card + 4, paddingHorizontal: space.l, paddingTop: space.s, maxHeight: '90%' },
  sheetHead: { flexDirection: 'row', alignItems: 'center', minHeight: 56 },
});
