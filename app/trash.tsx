/**
 * app/trash.tsx: deleted tasks, kept for 7 days (PLAN §9.16).
 *
 *   > trash                                   ✕
 *   Deleted tasks are kept for 7 days.
 *   SHIP V2 BUILD  (+3)        deleted 2h · 7 DAYS LEFT
 *     [ RESTORE ]  [ DELETE NOW ]
 *   [ EMPTY TRASH ]
 *
 * Layer: UI (Expo Router screen). Reached from the TRASH button on the
 * COMPLETED tab (and from Settings in Phase 13). RESTORE puts a task back
 * in its original place, with its subtasks; DELETE NOW and EMPTY TRASH are
 * permanent, so they ask first.
 */
import { router } from 'expo-router';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMinute } from '@/components/common/useMinute';
import { trashed } from '@/lib/bulk';
import { formatRelative } from '@/lib/dates';
import { TRASH_DAYS } from '@/lib/purge';
import { subtreeIds } from '@/lib/tree';
import { useActions, useAppStore } from '@/store/react';
import { colors, glyphs, maxFontSizeMultiplier, platformText, shape, size, space, type } from '@/theme';

const DAY = 86_400_000;

/** Asks before permanently deleting. */
function confirm(title: string, onYes: () => void) {
  Alert.alert(title, 'This cannot be undone.', [
    { text: 'CANCEL', style: 'cancel' },
    { text: 'DELETE', style: 'destructive', onPress: onYes },
  ]);
}

export default function TrashScreen() {
  const insets = useSafeAreaInsets();
  const tasks = useAppStore((s) => s.tasks);
  const actions = useActions();
  const now = useMinute();
  const items = trashed(tasks);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={[type.display, styles.title]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
          {`${glyphs.prompt.glyph} trash`}
        </Text>
        <Pressable onPress={() => router.back()} style={styles.close} accessibilityRole="button" accessibilityLabel="Close trash">
          <Text style={[type.glyph, styles.accent]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
            {glyphs.delete.glyph}
          </Text>
        </Pressable>
      </View>
      <Text style={[type.meta, styles.note]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {`Deleted tasks are kept for ${TRASH_DAYS} days, then removed for good.`}
      </Text>

      <FlatList
        data={items}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xl }}
        ListEmptyComponent={
          <Text style={[type.body, styles.empty]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
            {`${glyphs.prompt.glyph} TRASH IS EMPTY.`}
          </Text>
        }
        renderItem={({ item }) => {
          const extra = subtreeIds(tasks, item.id).length - 1;
          const daysLeft = Math.max(0, Math.ceil((item.deletedAt! + TRASH_DAYS * DAY - now) / DAY));
          return (
            <View style={styles.item}>
              <Text style={[type.group, styles.bright]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
                {`${item.title || 'Untitled task'}${extra ? `  (+${extra})` : ''}`}
              </Text>
              <Text style={[type.meta, styles.dim]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
                {`DELETED ${formatRelative(item.deletedAt!, now)} · ${daysLeft} ${daysLeft === 1 ? 'DAY' : 'DAYS'} LEFT`}
              </Text>
              <View style={styles.buttons}>
                <Button label={`${glyphs.undo.glyph} RESTORE`} onPress={() => actions.restoreFromTrash(item.id)} />
                <Button
                  label={`${glyphs.delete.glyph} DELETE NOW`}
                  onPress={() => confirm(`Delete "${item.title || 'task'}" permanently?`, () => actions.purgeFromTrash([item.id]))}
                />
              </View>
            </View>
          );
        }}
        ListFooterComponent={
          items.length ? (
            <View style={styles.footer}>
              <Button
                label={`${glyphs.delete.glyph} EMPTY TRASH`}
                onPress={() =>
                  confirm(`Delete all ${items.length} tasks in Trash permanently?`, () => actions.purgeFromTrash(items.map((t) => t.id)))
                }
              />
            </View>
          ) : null
        }
      />
    </View>
  );
}

function Button({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={[type.tab, styles.accent]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: space.md,
  },
  title: { color: colors.accent, ...platformText },
  close: {
    width: size.hitTarget,
    height: size.hitTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: shape.hairline,
    borderColor: colors.line,
    borderRadius: shape.radius,
  },
  note: { color: colors.textDim, paddingHorizontal: space.lg, paddingVertical: space.sm, ...platformText },
  empty: { color: colors.textDim, padding: space.lg, ...platformText },
  item: { paddingHorizontal: space.lg, paddingVertical: space.md, borderTopWidth: shape.hairline, borderTopColor: colors.line },
  bright: { color: colors.textBright, ...platformText },
  dim: { color: colors.textDim, marginTop: space.xs, ...platformText },
  buttons: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  footer: { padding: space.lg },
  button: {
    minHeight: size.hitTarget,
    paddingHorizontal: space.md,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: shape.hairline,
    borderColor: colors.line,
    borderRadius: shape.radius,
    backgroundColor: colors.surface,
  },
  pressed: { borderColor: colors.accent },
  accent: { color: colors.accent, ...platformText },
});
