/**
 * store/uiState.ts: view state that persists across launches (PLAN §7.3 `ui.v1`).
 *
 * Layer: store. Per-task collapse state lives on the task itself
 * (`task.collapsed`); this holds everything else about the view.
 */
import type { CategoryTab } from '@/lib/quests';
import type { ID } from '@/lib/types';

export type Tab = 'active' | 'completed';

export interface UiState {
  /** Last open tab, restored on launch (PLAN §9.1). */
  tab: Tab;
  /** Zoom (focus mode) root on the ACTIVE tab, or null. */
  zoomRootId: ID | null;
  /** COMPLETED-tab subtrees the user expanded (collapsed by default, PLAN §9.6). */
  completedExpanded: ID[];
  /**
   * The quest tab: ALL, DAILY, MAIN or MISC (lib/quests.ts). `tab` above is
   * the ACTIVE / COMPLETED switch under it. Added 2026-10-09; loadJSON fills
   * the default for saved UI state from before.
   */
  category: CategoryTab;
}

export const DEFAULT_UI: UiState = { tab: 'active', zoomRootId: null, completedExpanded: [], category: 'all' };
