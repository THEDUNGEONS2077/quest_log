/**
 * components/list/titleStyle.ts: which text style a row title uses, shared
 * by the ACTIVE list, the COMPLETED list and the inline editor, so a title
 * looks the same in every place (user request 2026-10-08).
 *
 * Layer: UI.
 *   group    a top-level task with subtasks: 14 pt uppercase bold
 *   subtask  any nested task: 15 pt
 *   body     a top-level task without subtasks: 17 pt
 * Smaller variants are nudged down so their first line stays aligned with
 * the 24 pt-tall checkbox and caret.
 */
import { StyleSheet } from 'react-native';

import { type } from '@/theme';

export type TitleVariant = 'group' | 'subtask' | 'body';

/** The variant for a row at `depth` with or without children. */
export function titleVariant(depth: number, hasChildren: boolean): TitleVariant {
  if (depth === 0) return hasChildren ? 'group' : 'body';
  return 'subtask';
}

/** Half the difference in line height, to center a smaller line on a body-height line. */
const nudge = (lineHeight: number) => (type.body.lineHeight - lineHeight) / 2;

export const titleStyles = StyleSheet.create({
  group: { ...type.group, paddingTop: nudge(type.group.lineHeight) },
  subtask: { ...type.subtask, paddingTop: nudge(type.subtask.lineHeight) },
  body: type.body,
});
