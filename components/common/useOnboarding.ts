/**
 * components/common/useOnboarding.ts: first-run tips, "What's new" and the
 * first-launch focus (PLAN §9.19).
 *
 * Layer: UI glue for the main screen. Waits for the boot screen to go
 * (useBooting), then once per launch:
 *   - after an update: opens "What's new" with the versions since the
 *     last build seen,
 *   - on a fresh install (no build recorded, no tasks): focuses the
 *     quick-add bar, so the first task can be typed straight away,
 * and records this build as seen either way.
 *
 * Tips: while the main screen is in front, each change to the tasks'
 * structure or to editing checks for the next first-run tip
 * (store/onboarding.ts). A tip only shows when no other toast is up, so it
 * never hides an UNDO.
 */
import { router, useIsFocused } from 'expo-router';
import { useEffect } from 'react';

import { taskCount } from '@/lib/taskMap';
import { appBuild } from '@/services/appInfo';
import { nextTip } from '@/store/onboarding';
import { useStoreBundle } from '@/store/react';

import { useBooting } from './BootSequence';

/** Has this launch's What's new check run (once per JS process). */
let checked = false;
/** What's new was just opened: tips wait until the main screen is back in front. */
let whatsNewPending = false;

/** Runs the onboarding checks for the main screen. */
export function useOnboarding(): void {
  const booting = useBooting();
  const focused = useIsFocused();
  const { store } = useStoreBundle();

  // Once per launch, after the boot screen: What's new, or the first-launch focus.
  useEffect(() => {
    if (booting || checked) return;
    checked = true;
    const s = store.getState();
    const build = appBuild();
    const seen = s.onboarding.lastSeenBuild;
    if (seen === build) return;
    s.markWhatsNewSeen(build);
    const hasData = taskCount(s.tasks) > 0;
    if (seen === null && !hasData) {
      s.requestQuickAdd(); // fresh install: ready to type
    } else if (seen === null || seen < build) {
      whatsNewPending = true;
      router.push({ pathname: '/whats-new', params: { since: seen === null ? 'none' : String(seen) } });
    }
  }, [booting, store]);

  // First-run tips, while the main screen is in front.
  useEffect(() => {
    if (booting) return;
    // What's new is opening over the screen: hold the tips until it's closed again.
    if (whatsNewPending) {
      if (!focused) whatsNewPending = false;
      return;
    }
    if (!focused) return;
    const check = () => {
      const s = store.getState();
      if (s.toast) return;
      const tip = nextTip(s.onboarding.tipsSeen, { tasks: s.tasks, editing: s.editingId !== null, swipeActions: s.settings.swipeActions });
      if (tip) s.showTip(tip);
    };
    check();
    return store.subscribe((s) => [s.tasks.structureVersion, s.editingId] as const, check, {
      equalityFn: (a, b) => a[0] === b[0] && a[1] === b[1],
    });
  }, [booting, focused, store]);
}
