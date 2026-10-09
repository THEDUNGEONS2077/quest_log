/**
 * app/index.tsx: the main screen (PLAN §9.1, §12.1, §12.2, §12.7).
 *
 *   header      > quest_log · counts · [/] [?]
 *   tabs        [ ACTIVE QUESTS · 12 ][ COMPLETED · 34 ]
 *   XP bar      [■■■■■■□□□□]  340/425 XP (both tabs)
 *   search      search field (+ filter chips on ACTIVE), when open
 *   breadcrumb  ← ALL / WORK / …, when zoomed in (ACTIVE)
 *   list        the selected tab's list
 *   toast       COMPLETED · UNDO (above the bottom bar)
 *   bottom bar  one of: multi-select actions · editing toolbar · quick-add
 *   overlays    due date, repeat, Move to… (each renders itself when open)
 *
 * Layer: UI (Expo Router screen). Composition only.
 *
 * Both lists stay mounted once visited and are only hidden, so each tab
 * keeps its own scroll position and switching is instant (PLAN §5 tab
 * switch < 50 ms). The COMPLETED list mounts the first time it's opened.
 *
 * Android back steps out of the innermost mode first: selection, then
 * search, then zoom (one level at a time), and only then leaves the app.
 */
import { useEffect, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Breadcrumb } from '@/components/common/Breadcrumb';
import { Header } from '@/components/common/Header';
import { SearchBar } from '@/components/common/SearchBar';
import { Tabs } from '@/components/common/Tabs';
import { XpBar } from '@/components/common/XpBar';
import { useOnboarding } from '@/components/common/useOnboarding';
import { EditToolbar } from '@/components/edit/EditToolbar';
import { QuickAddBar } from '@/components/edit/QuickAddBar';
import { SelectionBar } from '@/components/edit/SelectionBar';
import { CompletedList } from '@/components/list/CompletedList';
import { TaskList } from '@/components/list/TaskList';
import { DueSheet } from '@/components/overlays/DueSheet';
import { MovePicker } from '@/components/overlays/MovePicker';
import { RepeatSheet } from '@/components/overlays/RepeatSheet';
import { Toast } from '@/components/overlays/Toast';
import { useAppStore, useStoreBundle } from '@/store/react';
import { colors, shape, size, space } from '@/theme';

export default function ListScreen() {
  const insets = useSafeAreaInsets();
  // The list leaves room at the bottom for the bar that floats over it.
  const [barHeight, setBarHeight] = useState<number>(size.hitTarget + space.lg);
  const editingId = useAppStore((s) => s.editingId);
  const tab = useAppStore((s) => s.ui.tab);
  const selecting = useAppStore((s) => s.selection !== null);
  const searchOpen = useAppStore((s) => s.search[s.ui.tab].open);
  const zoomed = useAppStore((s) => s.ui.zoomRootId !== null);
  const { store } = useStoreBundle();
  // First-run tips, What's new after an update, first-launch focus.
  useOnboarding();

  // Mount COMPLETED lazily, then keep it (its scroll position survives tab switches).
  const [completedMounted, setCompletedMounted] = useState(tab === 'completed');
  if (tab === 'completed' && !completedMounted) setCompletedMounted(true);

  // Android back: leave the innermost mode first (see file header).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const s = store.getState();
      if (s.selection) {
        s.clearSelection();
        return true;
      }
      if (s.search[s.ui.tab].open) {
        s.closeSearch(s.ui.tab);
        return true;
      }
      if (s.ui.tab === 'active' && s.ui.zoomRootId) {
        s.zoomOut();
        return true;
      }
      return false; // default: leave the app
    });
    return () => sub.remove();
  }, [store]);

  // Bottom bar: selection actions > editing toolbar > quick-add (ACTIVE, not while searching).
  const showQuickAdd = tab === 'active' && !editingId && !selecting && !searchOpen;
  const selectionBarHeight = size.hitTarget + size.toolbarHeight + insets.bottom;
  const bottomBar = selecting ? selectionBarHeight : showQuickAdd || editingId ? barHeight : insets.bottom;
  const listInset = bottomBar + space.lg;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.content}>
        {/* The top panel never scrolls; its bottom divider stays put while the list
            scrolls under it (user request 2026-10-09). */}
        <View style={styles.topPanel}>
          <Header />
          <Tabs />
          <XpBar />
          {searchOpen && <SearchBar key={tab} tab={tab} />}
          {tab === 'active' && zoomed && <Breadcrumb />}
        </View>
        <View style={[styles.list, tab !== 'active' && styles.hidden]}>
          <TaskList bottomInset={listInset} />
        </View>
        {completedMounted && (
          <View style={[styles.list, tab !== 'completed' && styles.hidden]}>
            <CompletedList bottomInset={listInset} />
          </View>
        )}
      </View>
      <Toast bottom={bottomBar + space.sm} />
      {/* Overlays render themselves when open. */}
      <DueSheet />
      <RepeatSheet />
      <MovePicker />
      {selecting ? (
        <SelectionBar />
      ) : editingId ? (
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
  topPanel: { backgroundColor: colors.bg, borderBottomWidth: shape.hairline, borderBottomColor: colors.line },
  list: { flex: 1 },
  hidden: { display: 'none' },
});
