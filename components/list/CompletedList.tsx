/**
 * components/list/CompletedList.tsx: the COMPLETED tab (PLAN §9.6, §12.2).
 *
 *                             CLEAR…
 *   ▸ [x] Plan trip              2h
 *     [x] Renew passport      MAR 14
 *
 * Layer: UI. Completed top-level tasks, most recently modified first.
 * Subtrees are collapsed until expanded. Rows are still editable: tap a
 * title to fix a typo. No drag here, since order is by date.
 *
 *   swipe right     → RESTORE (back to its original place on ACTIVE)
 *   swipe left      → DELETE (to Trash)
 *   [x] tap         → RESTORE
 *   long-press      → menu: Restore · Run again · Delete
 *   CLEAR…          → older than 7 days / 30 days / all (to Trash, undoable)
 */
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { router } from 'expo-router';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { type AccessibilityActionEvent, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatRelative } from '@/lib/dates';
import type { Row } from '@/lib/flatten';
import type { FoundRow } from '@/lib/search';
import { findTask } from '@/lib/taskMap';
import { haptics } from '@/services/haptics';
import { useActions, useAppStore, useSelectors } from '@/store/react';
import { colors, glyphs, maxFontSizeMultiplier, platformText, shape, size, space, type } from '@/theme';

import { useMinute } from '@/components/common/useMinute';
import { InlineEditor } from '@/components/edit/InlineEditor';
import { NotesEditor, NotesView } from '@/components/edit/NotesField';
import { ActionSheet, type SheetAction } from '@/components/overlays/ActionSheet';

import { HighlightFlash } from './HighlightFlash';
import { KeepInViewProvider, useKeepInViewController } from './keepInView';
import { NestingGuides } from './NestingGuides';
import { useKeyboardHeight } from './useKeyboardHeight';
import { SwipeableRow } from './SwipeableRow';
import { titleStyles, titleVariant } from './titleStyle';

export function CompletedList({ bottomInset }: { bottomInset: number }) {
  const selectors = useSelectors();
  const rows = useAppStore((s) => selectors.completedRows(s));
  const renderItem = useCallback(({ item }: { item: Row }) => <CompletedRow row={item} />, []);
  const list = useRef<FlashListRef<Row>>(null);
  const container = useRef<View>(null);
  const keyboardHeight = useKeyboardHeight();
  const editing = useAppStore((s) => s.editingId !== null);

  // Completed tasks can be edited too: keep the typed text in view (keepInView.tsx).
  const keepInView = useKeepInViewController(container, list);
  useEffect(() => {
    if (keyboardHeight > 0 && editing) keepInView.ensure();
  }, [keyboardHeight, editing, keepInView]);

  // A task opened from a notification or link: scroll to it.
  const highlightId = useAppStore((s) => s.highlightId);
  useEffect(() => {
    if (!highlightId) return;
    const index = rows.findIndex((r) => r.id === highlightId);
    if (index >= 0) list.current?.scrollToIndex({ index, animated: true, viewPosition: 0.3 });
  }, [highlightId, rows]);

  return (
    <View ref={container} style={styles.container} collapsable={false}>
      <KeepInViewProvider value={keepInView}>
        <FlashList
          ref={list}
          data={rows}
          renderItem={renderItem}
          keyExtractor={(r) => r.id}
          getItemType={(r) => (r.depth === 0 ? 'top' : 'sub')}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={<ListHeader hasRows={rows.length > 0} />}
          ListEmptyComponent={Empty}
          contentContainerStyle={{ paddingBottom: bottomInset + (keyboardHeight ? keyboardHeight + size.toolbarHeight : 0) }}
        />
      </KeepInViewProvider>
    </View>
  );
}

/** "CLEAR…" at the top right: choose how much to move to Trash. */
/** Header row: TRASH (always) and CLEAR… (when there's something to clear). */
function ListHeader({ hasRows }: { hasRows: boolean }) {
  const actions = useActions();
  const [open, setOpen] = useState(false);
  const options: SheetAction[] = [
    { glyph: glyphs.delete.glyph, label: 'Older than 7 days', onPress: () => actions.clearCompleted(7) },
    { glyph: glyphs.delete.glyph, label: 'Older than 30 days', onPress: () => actions.clearCompleted(30) },
    { glyph: glyphs.delete.glyph, label: 'All completed', onPress: () => actions.clearCompleted(null) },
  ];
  return (
    <View style={styles.clearRow}>
      <Pressable onPress={() => router.push('/trash')} style={styles.clear} accessibilityRole="button" accessibilityLabel="Open Trash">
        <Text style={[type.meta, styles.clearText]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
          {`${glyphs.delete.glyph} TRASH`}
        </Text>
      </Pressable>
      {hasRows && (
        <Pressable onPress={() => setOpen(true)} style={styles.clear} accessibilityRole="button" accessibilityLabel="Clear completed tasks">
          <Text style={[type.meta, styles.clearText]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
            CLEAR…
          </Text>
        </Pressable>
      )}
      <ActionSheet visible={open} title="Clear completed" actions={options} onClose={() => setOpen(false)} />
    </View>
  );
}

function Empty() {
  return (
    <Text style={[type.body, styles.empty]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
      {`${glyphs.prompt.glyph} NOTHING COMPLETED YET.`}
    </Text>
  );
}

const CompletedRow = memo(
  function CompletedRow({ row }: { row: Row }) {
    const task = useAppStore((s) => findTask(s.tasks, row.id));
    const editing = useAppStore((s) => s.editingId === row.id);
    const field = useAppStore((s) => (s.editingId === row.id ? s.editingField : null));
    const expanded = useAppStore((s) => s.ui.completedExpanded.includes(row.id));
    const swipeOn = useAppStore((s) => s.settings.swipeActions);
    const actions = useActions();
    const [menu, setMenu] = useState(false);
    if (!task) return null;

    const restore = () => {
      haptics.check();
      actions.restoreTask(task.id);
    };
    const remove = () => {
      haptics.delete();
      actions.deleteTask(task.id);
    };
    const menuActions: SheetAction[] = [
      { glyph: glyphs.undo.glyph, label: 'Restore', onPress: restore },
      // Run again copies a whole checklist; it applies to top-level tasks.
      ...(row.depth === 0 ? [{ glyph: glyphs.duplicate.glyph, label: 'Run again', onPress: () => actions.runAgain(task.id) }] : []),
      { glyph: glyphs.delete.glyph, label: 'Delete', onPress: remove },
    ];
    const onAccessibilityAction = (e: AccessibilityActionEvent) => {
      if (e.nativeEvent.actionName === 'restore') restore();
      else if (e.nativeEvent.actionName === 'delete') remove();
      else if (e.nativeEvent.actionName === 'menu') setMenu(true);
    };
    const visualDepth = Math.min(row.depth, size.maxVisualDepth);
    // Search results: an ancestor shown only for context is drawn dimmed.
    const context = 'context' in row && (row as FoundRow).context;
    const variant = titleVariant(row.depth, row.hasChildren);

    return (
      <>
        <View style={context && styles.context}>
          <SwipeableRow
            enabled={swipeOn && !editing}
            right={{ label: `${glyphs.undo.glyph} RESTORE`, onCommit: restore }}
            left={{ label: `${glyphs.delete.glyph} DEL`, onCommit: remove }}
          >
            <Pressable
              onLongPress={() => setMenu(true)}
              delayLongPress={400}
              style={[
                styles.row,
                { paddingLeft: space.lg + visualDepth * size.indent },
                row.depth === 0 && styles.topLevel,
                editing && styles.editing,
              ]}
              accessible={!editing}
              accessibilityLabel={`${task.title || 'Untitled task'}, completed`}
              accessibilityActions={[
                { name: 'restore', label: 'Restore' },
                { name: 'delete', label: 'Delete' },
                { name: 'menu', label: 'More actions' },
              ]}
              onAccessibilityAction={onAccessibilityAction}
            >
              <HighlightFlash rowId={row.id} />
              <NestingGuides levels={visualDepth} />
              {/* Caret: subtrees are collapsed by default on this tab. */}
              <Pressable
                style={styles.caret}
                hitSlop={HIT_SLOP}
                disabled={!row.hasChildren}
                onPress={() => actions.toggleCompletedExpanded(task.id)}
                accessibilityLabel={expanded ? 'Collapse' : 'Expand'}
              >
                {row.hasChildren && (
                  <Text style={[type.caretGlyph, styles.dim]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
                    {expanded ? glyphs.expanded.glyph : glyphs.collapsed.glyph}
                  </Text>
                )}
              </Pressable>
              <Pressable
                style={styles.checkbox}
                hitSlop={HIT_SLOP}
                onPress={restore}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: true }}
              >
                <Text style={[type.glyph, styles.dim, styles.checkboxText]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
                  {glyphs.checkboxOn.glyph}
                </Text>
              </Pressable>
              {/* No strikethrough here: a full screen of them is noise (PLAN §9.6). */}
              <View style={styles.title}>
                {field === 'title' ? (
                  <InlineEditor id={task.id} title={task.title} variant={variant} />
                ) : (
                  <Text
                    style={[titleStyles[variant], styles.dim]}
                    onPress={() => actions.setEditing(task.id)}
                    onLongPress={() => setMenu(true)}
                    suppressHighlighting
                    maxFontSizeMultiplier={maxFontSizeMultiplier}
                  >
                    {task.title}
                  </Text>
                )}
                {/* Details under the title, as on ACTIVE: ↻ for an archived repeat, and when it was last changed. */}
                {!editing && (task.repeatSourceId !== null || row.depth === 0) && (
                  <View style={styles.details}>
                    {task.repeatSourceId !== null && (
                      <Text
                        style={[type.metaGlyph, styles.dim]}
                        accessibilityLabel="repeat occurrence"
                        maxFontSizeMultiplier={maxFontSizeMultiplier}
                      >
                        {glyphs.repeat.glyph}
                      </Text>
                    )}
                    {row.depth === 0 && <Modified at={task.updatedAt} />}
                  </View>
                )}
                {/* Notes can still be added or fixed after the fact. */}
                {field === 'notes' ? (
                  <NotesEditor id={task.id} notes={task.notes} />
                ) : (
                  editing && <NotesView notes={task.notes} onEdit={() => actions.setEditing(task.id, null, 'notes')} />
                )}
              </View>
            </Pressable>
          </SwipeableRow>
        </View>
        {menu && <ActionSheet visible title={task.title || 'Untitled task'} actions={menuActions} onClose={() => setMenu(false)} />}
      </>
    );
  },
  (a, b) => a.row.id === b.row.id && a.row.depth === b.row.depth && a.row.hasChildren === b.row.hasChildren,
);

/** "Last modified" under the title: 2h, YESTERDAY, MAR 14. Updates each minute. */
function Modified({ at }: { at: number }) {
  const now = useMinute();
  return (
    <Text style={[type.meta, styles.dim]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
      {formatRelative(at, now)}
    </Text>
  );
}

const HIT_SLOP = { top: space.md, bottom: space.md, left: space.md, right: space.md };

const styles = StyleSheet.create({
  container: { flex: 1 },
  row: {
    minHeight: size.rowMinHeight,
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingRight: space.lg,
    paddingVertical: space.md,
    backgroundColor: colors.bg,
  },
  editing: { backgroundColor: colors.surface },
  // Same separation as ACTIVE: a divider above every top-level task.
  topLevel: { borderTopWidth: shape.hairline, borderTopColor: colors.line, marginTop: space.sm },
  caret: { width: size.indent, alignItems: 'center' },
  checkbox: { marginRight: space.md, marginLeft: space.xs },
  checkboxText: { letterSpacing: shape.checkboxTracking },
  title: { flex: 1, minWidth: 0 },
  dim: { color: colors.textDim, ...platformText },
  context: { opacity: 0.4 },
  details: { flexDirection: 'row', alignItems: 'center', columnGap: space.md, marginTop: space.xs },
  clearRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm, paddingHorizontal: space.lg },
  clear: {
    minHeight: size.hitTarget,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderWidth: shape.hairline,
    borderColor: colors.line,
    borderRadius: shape.radius,
  },
  clearText: { color: colors.text, ...platformText },
  empty: { color: colors.textDim, paddingHorizontal: space.lg, paddingTop: space.xl, ...platformText },
});
