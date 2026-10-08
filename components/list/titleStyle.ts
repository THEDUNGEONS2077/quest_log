/**
 * components/list/titleStyle.ts: which text style a row title uses, shared
 * by the ACTIVE list, the COMPLETED list and the inline editor, so a title
 * looks the same in every place (user request 2026-10-08).
 *
 * Layer: UI.
 *   group    every top-level task, with or without subtasks: 14 pt
 *            uppercase bold, bright (user request 2026-10-08: all main
 *            tasks in caps like group titles)
 *   subtask  any nested task: 15 pt, mixed case
 *   body     plain 17 pt (kept for inputs such as the quick-add bar)
 * Smaller variants are nudged down so their first line stays aligned with
 * the 24 pt-tall checkbox and caret.
 */
import { StyleSheet } from 'react-native';

import { type } from '@/theme';

export type TitleVariant = 'group' | 'subtask' | 'body';

/** The variant for a row at `depth` with or without children. */
export function titleVariant(depth: number, _hasChildren: boolean): TitleVariant {
  return depth === 0 ? 'group' : 'subtask';
}

/** Half the difference in line height, to center a smaller line on a body-height line. */
const nudge = (lineHeight: number) => (type.body.lineHeight - lineHeight) / 2;

export const titleStyles = StyleSheet.create({
  group: { ...type.group, paddingTop: nudge(type.group.lineHeight) },
  subtask: { ...type.subtask, paddingTop: nudge(type.subtask.lineHeight) },
  body: type.body,
});
