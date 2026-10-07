/**
 * app/index.tsx: Phase 1 placeholder, the theme and glyph check screen.
 *
 * Layer: UI. This screen exists to verify the design system on a real
 * device (PLAN §16, Phase 1, "glyph check"):
 *   - every color token as a swatch, with its contrast ratio on black,
 *   - every type role rendered in JetBrains Mono,
 *   - every glyph from theme/glyphs.ts next to the glyph PLAN §8.4
 *     originally specified, so the substitutes can be judged side by side.
 *
 * Phase 3 adds a STORE panel (components/dev/StorePanel.tsx) to check
 * persistence on the device.
 *
 * Phase 4 replaces this screen with the real task list (ACTIVE / COMPLETED).
 */
import Constants from 'expo-constants';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StorePanel } from '@/components/dev/StorePanel';

import {
  colors,
  glyphs,
  maxFontSizeMultiplier,
  platformText,
  shape,
  size,
  space,
  type,
  type ColorToken,
  type Glyph,
  type TypeRole,
} from '@/theme';

/** Version line shown in the header, e.g. "v0.1.0 (build 1) · dev". */
function versionLabel(): string {
  const extra = Constants.expoConfig?.extra ?? {};
  return `v${String(extra.versionName)} (build ${String(extra.versionCode)}) · ${String(extra.variant)}`;
}

/** Section heading in the terminal style: `> TITLE`. */
function Section({ title }: { title: string }) {
  return (
    <Text style={[styles.text, type.tab, styles.section]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
      {`> ${title}`}
    </Text>
  );
}

/** One color token: swatch, name, hex value. */
function Swatch({ name }: { name: ColorToken }) {
  return (
    <View style={styles.row}>
      <View style={[styles.swatch, { backgroundColor: colors[name] }]} />
      <Text style={[styles.text, type.meta, { color: colors.text }]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {`${name.padEnd(14)}${colors[name]}`}
      </Text>
    </View>
  );
}

/** One glyph: the rendered glyph, its name, and the planned glyph if it was substituted. */
function GlyphRow({ name, g }: { name: string; g: Glyph }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.text, type.body, styles.glyphCell, { color: colors.accent }]}>{g.glyph}</Text>
      <Text style={[styles.text, type.meta, styles.glyphName]}>{name}</Text>
      {/* The originally planned glyph renders in the system fallback font. */}
      <Text style={[styles.text, type.body, styles.glyphCell, { color: colors.textDim }]}>{g.planned ?? ''}</Text>
      {!g.inFont && <Text style={[styles.text, type.meta]}>FALLBACK FONT</Text>}
    </View>
  );
}

const roles = Object.keys(type) as TypeRole[];
const tokens = Object.keys(colors) as ColorToken[];

export default function ThemeCheckScreen() {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xl }]}
    >
      {/* Header: the app's terminal-style title. */}
      <Text style={[type.display, styles.title]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {`${glyphs.prompt.glyph} quest_log_`}
      </Text>
      <Text style={[styles.text, type.meta]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {`THEME CHECK · ${versionLabel()}`}
      </Text>

      {/* Phase 3: store and persistence check (removed in Phase 4). */}
      <Section title="STORE" />
      <StorePanel />

      <Section title="COLORS" />
      {tokens.map((t) => (
        <Swatch key={t} name={t} />
      ))}

      <Section title="TYPE" />
      {roles.map((r) => (
        <Text key={r} style={[styles.text, type[r], { color: colors.textBright }]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
          {`${r}: Ship v2 build 0O1lI`}
        </Text>
      ))}

      {/* Columns: in-use glyph | name | glyph planned in PLAN §8.4 */}
      <Section title="GLYPHS  (USED · NAME · PLANNED)" />
      {Object.entries(glyphs).map(([name, g]) => (
        <GlyphRow key={name} name={name} g={g} />
      ))}

      <Section title="BOX DRAWING" />
      <Text style={[styles.text, type.body]}>{'┏━━━━━━━━━━┓\n┃ │ ├ └ ┄ ┃\n┗━━━━━━━━━━┛'}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space.lg, maxWidth: size.maxContentWidth },
  title: { color: colors.accent, ...platformText },
  text: { color: colors.text, ...platformText },
  section: { color: colors.textBright, marginTop: space.xl, marginBottom: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: space.xl, gap: space.md },
  swatch: {
    width: space.xl,
    height: space.lg,
    borderRadius: shape.radius,
    borderWidth: shape.hairline,
    borderColor: colors.line,
  },
  glyphCell: { width: space.xl * 2 },
  glyphName: { width: space.xl * 5 },
});
