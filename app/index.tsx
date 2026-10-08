/**
 * app/index.tsx: the main screen (PLAN §9.1, §12.1, §12.2).
 *
 *   header      > quest_log · counts
 *   tabs        [ ACTIVE QUESTS · 12 ][ COMPLETED · 34 ]
 *   list        the selected tab's list
 *   toast       COMPLETED · UNDO (above the bottom bar)
 *   bottom bar  quick-add (ACTIVE), or the editing toolbar while editing
 *
 * Layer: UI (Expo Router screen). Composition only.
 *
 * Both lists stay mounted once visited and are only hidden, so each tab
 * keeps its own scroll position and switching is instant (PLAN §5 tab
 * switch < 50 ms). The COMPLETED list mounts the first time it's opened.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Header } from '@/components/common/Header';
import { Tabs } from '@/components/common/Tabs';
import { EditToolbar } from '@/components/edit/EditToolbar';
import { QuickAddBar } from '@/components/edit/QuickAddBar';
import { CompletedList } from '@/components/list/CompletedList';
import { TaskList } from '@/components/list/TaskList';
import { DueSheet } from '@/components/overlays/DueSheet';
import { RepeatSheet } from '@/components/overlays/RepeatSheet';
import { Toast } from '@/components/overlays/Toast';
import { useAppStore } from '@/store/react';
import { colors, size, space } from '@/theme';

export default function ListScreen() {
  const insets = useSafeAreaInsets();
  // The list leaves room at the bottom for the bar that floats over it.
  const [barHeight, setBarHeight] = useState<number>(size.hitTarget + space.lg);
  const editingId = useAppStore((s) => s.editingId);
  const tab = useAppStore((s) => s.ui.tab);

  // Mount COMPLETED lazily, then keep it (its scroll position survives tab switches).
  const [completedMounted, setCompletedMounted] = useState(tab === 'completed');
  if (tab === 'completed' && !completedMounted) setCompletedMounted(true);

  const listInset = barHeight + space.lg;
  // The quick-add bar exists only on ACTIVE; on COMPLETED the list reaches the bottom edge.
  const showQuickAdd = tab === 'active' && !editingId;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.content}>
        <Header />
        <Tabs />
        <View style={[styles.list, tab !== 'active' && styles.hidden]}>
          <TaskList bottomInset={listInset} />
        </View>
        {completedMounted && (
          <View style={[styles.list, tab !== 'completed' && styles.hidden]}>
            <CompletedList bottomInset={listInset} />
          </View>
        )}
      </View>
      <Toast bottom={(showQuickAdd || editingId ? barHeight : insets.bottom) + space.sm} />
      {/* The due-date sheet renders itself when a task's sheet is open. */}
      <DueSheet />
      <RepeatSheet />
      {editingId ? (
        <EditToolbar editingId={editingId} structure={tab === 'active'} />
      ) : (
        showQuickAdd && <QuickAddBar onHeight={setBarHeight} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  // Caps the width on large screens and split-screen (PLAN §9.20).
  content: { flex: 1, width: '100%', maxWidth: size.maxContentWidth, alignSelf: 'center' },
  list: { flex: 1 },
  hidden: { display: 'none' },
});
