/**
 * app/index.tsx: the main screen (PLAN §9.1, §12.1, §12.2, §12.7).
 *
 *   header      > quest_log · counts · [/] [?]
 *   tabs        [ ALL ][ DAILY ][ MAIN ][ MISC ]   quest tabs (lib/quests.ts)
 *               [ ACTIVE · 12 ][ COMPLETED · 34 ]   the switch for that tab
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
 * Both lists stay mounted once visited and are only hidden. The COMPLETED
 * list mounts the first time it's opened. Every tab switch shows a list
 * from the top (each list starts afresh: useViewPlace.ts), and slides it in
 * from its side (COMPLETED is on the right), as the quest tabs and zoom
 * levels do inside each list.
 *
 * Tapping the title goes home; tapping the selected tab again goes to the
 * top of it (store goHome / toTabTop).
 *
 * Android back steps out of the innermost thing first: typing in quick-add,
 * editing, the quick-add group target, selection, search, zoom (one level
 * at a time), COMPLETED → ACTIVE, a quest tab → ALL. Only with nothing left
 * does it leave the app (store backStep).
 */
import { useEffect, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBooting } from '@/components/common/BootSequence';
import { Breadcrumb } from '@/components/common/Breadcrumb';
import { Header } from '@/components/common/Header';
import { Phosphor } from '@/components/common/Phosphor';
import { LitEdge } from '@/components/common/Rule';
import { SearchBar } from '@/components/common/SearchBar';
import { Tabs } from '@/components/common/Tabs';
import { XpBar } from '@/components/common/XpBar';
import { Onboarding } from '@/components/common/useOnboarding';
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
  // While the boot screen covers the app, the panel's scanlines stay still (nothing to see, nothing to draw).
  const booting = useBooting();
  const { store } = useStoreBundle();

  // Mount COMPLETED lazily, then keep it. ACTIVE ↔ COMPLETED has no animation: the list is
  // simply there (user request 2026-10-18).

  const [completedMounted, setCompletedMounted] = useState(tab === 'completed');
  if (tab === 'completed' && !completedMounted) setCompletedMounted(true);

  // Android back: leave the innermost mode first (see file header).
  useEffect(() => {
    // One mode per press (store backStep); nothing left → default: leave the app.
    const sub = BackHandler.addEventListener('hardwareBackPress', () => store.getState().backStep());
    return () => sub.remove();
  }, [store]);

  // Bottom bar: selection actions > editing toolbar > quick-add (ACTIVE, not while searching).
  const showQuickAdd = tab === 'active' && !editingId && !selecting && !searchOpen;
  const selectionBarHeight = size.hitTarget + size.toolbarHeight + insets.bottom;
  const bottomBar = selecting ? selectionBarHeight : showQuickAdd || editingId ? barHeight : insets.bottom;
  const listInset = bottomBar + space.lg;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* First-run tips, What's new after an update, first-launch focus (draws nothing). */}
      <Onboarding />
      <View style={styles.content}>
        {/* The top panel never scrolls; its bottom divider stays put while the list
            scrolls under it (user request 2026-10-09). It's the terminal's lit screen:
            a soft phosphor light behind the title and fine scanlines, drifting slowly as on
            the desktop (Phosphor), and its divider is lit in the middle (LitEdge)
            (aesthetic pass 2026-10-17). */}
        <View style={styles.topPanel}>
          <Phosphor animated={!booting} />
          <Header />
          <Tabs />
          <XpBar />
          {searchOpen && <SearchBar key={tab} tab={tab} />}
          {tab === 'active' && zoomed && <Breadcrumb />}
          <LitEdge at="bottom" />
        </View>
        <View style={styles.list}>
          <View style={[styles.list, tab !== 'active' && styles.hidden]} {...hiddenProps(tab !== 'active')}>
            <TaskList bottomInset={listInset} />
          </View>
          {completedMounted && (
            <View style={[styles.list, tab !== 'completed' && styles.hidden]} {...hiddenProps(tab !== 'completed')}>
              <CompletedList bottomInset={listInset} />
            </View>
          )}
        </View>
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

/**
 * Touch and screen-reader props for the list that isn't showing: it takes no touches and
 * isn't read out (it's drawn invisible over or under the one that is; see styles.hidden).
 */
function hiddenProps(hidden: boolean) {
  return hidden
    ? // aria-hidden: hidden from screen readers on Android, iOS and the web alike.
      ({ pointerEvents: 'none', 'aria-hidden': true } as const)
    : ({ pointerEvents: 'auto' } as const);
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  // Caps the width on large screens and split-screen (PLAN §9.20).
  content: { flex: 1, width: '100%', maxWidth: size.maxContentWidth, alignSelf: 'center' },
  topPanel: { backgroundColor: colors.bg, borderBottomWidth: shape.hairline, borderBottomColor: colors.line },
  list: { flex: 1 },
  // The list that isn't showing keeps its full size, invisible: hidden with `display: 'none'`,
  // it was laid out at zero size, so its list (FlashList) measured every row at 0 pt and built
  // all of them (refinement pass 2026-10-18: 5,000 rows for a long COMPLETED history, kept
  // mounted and re-rendered by every change; the ACTIVE list's rows too). A fully transparent
  // view isn't drawn.
  hidden: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, opacity: 0 },
});
