/**
 * components/common/Breadcrumb.tsx: where you are when zoomed in (PLAN §9.2, §12.7).
 *
 *   ← ALL / WORK / Release notes
 *   2 OPEN · 1 DONE
 *
 * Layer: UI. Shown on the ACTIVE tab while zoomed into a task. Each part
 * is tappable and jumps to that level; ← ALL leaves zoom. Android back
 * also zooms out one level (app/index.tsx). It's a small component, so it
 * simply re-renders with the tree.
 */
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { findTask } from '@/lib/taskMap';
import { ancestors, liveChildIds } from '@/lib/tree';
import { useActions, useAppStore } from '@/store/react';
import { colors, maxFontSizeMultiplier, platformText, shape, size, space, type } from '@/theme';

export function Breadcrumb() {
  const zoom = useAppStore((s) => s.ui.zoomRootId);
  const tasks = useAppStore((s) => s.tasks);
  const actions = useActions();
  if (!zoom || !findTask(tasks, zoom)) return null;

  // Root first: ALL / ancestors… / the zoomed task.
  const path = [...ancestors(tasks, zoom).reverse(), zoom];
  const kids = liveChildIds(tasks, zoom).map((c) => findTask(tasks, c)!);
  const done = kids.filter((t) => t.done).length;

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.path}>
        <Crumb label="← ALL" onPress={() => actions.setZoom(null)} a11y="Back to all quests" />
        {path.map((id, i) => {
          const title = findTask(tasks, id)!.title || 'Untitled';
          const current = i === path.length - 1;
          return (
            <View key={id} style={styles.part}>
              <Text style={[type.meta, styles.sep]}>/</Text>
              <Crumb label={title} onPress={() => actions.setZoom(id)} current={current} a11y={`Go to ${title}`} />
            </View>
          );
        })}
      </ScrollView>
      <Text style={[type.meta, styles.counts]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {`${kids.length - done} OPEN · ${done} DONE`}
      </Text>
    </View>
  );
}

/** One tappable part of the path (the current level isn't a link). */
function Crumb({ label, onPress, current, a11y }: { label: string; onPress: () => void; current?: boolean; a11y: string }) {
  return (
    <Pressable onPress={onPress} disabled={current} style={styles.crumb} accessibilityRole="button" accessibilityLabel={a11y}>
      <Text style={[type.tab, current ? styles.current : styles.link]} numberOfLines={1} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: space.lg, paddingBottom: space.sm, borderBottomWidth: shape.hairline, borderBottomColor: colors.line },
  path: { alignItems: 'center' },
  part: { flexDirection: 'row', alignItems: 'center' },
  crumb: { minHeight: size.hitTarget, justifyContent: 'center', paddingHorizontal: space.xs },
  sep: { color: colors.textDim, ...platformText },
  link: { color: colors.accent, ...platformText },
  current: { color: colors.textBright, ...platformText },
  counts: { color: colors.textDim, ...platformText },
});
