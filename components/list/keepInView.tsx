/**
 * components/list/keepInView.tsx: whatever is being typed is always visible
 * (user requirement, 2026-10-08).
 *
 * Layer: UI. While a task's title or notes are being edited, the focused
 * text box must sit just above the editing toolbar (which rides on the
 * keyboard), never behind it, and never above the top of the list.
 *
 * How: measure, don't guess. Both the focused input and the toolbar are
 * measured with measureInWindow (same coordinate system, after the
 * keyboard animation), then the list scrolls by exactly the difference.
 * This runs:
 *   - when an editor takes focus (including a brand-new subtask row),
 *   - when the keyboard finishes opening,
 *   - when the text grows onto a new line.
 *
 * The list provides `ensure` through context; editors call it. The editing
 * toolbar registers its view, so its top edge is the "floor".
 */
import { createContext, type RefObject, useCallback, useContext, useMemo, useRef } from 'react';
import type { View } from 'react-native';

import { space } from '@/theme';

import { focusedInput } from './focusedInput';

/** Gap kept between the text box and the toolbar (and the list's top edge). */
const MARGIN = space.md;

/** Re-check after this long, once list layout has settled. */
const SETTLE_MS = 300;

/** The editing toolbar's view: its top edge is the lowest point text may reach. */
let floorView: View | null = null;

/** Called by EditToolbar with its root view (null on unmount). */
export function registerFloor(view: View | null): void {
  floorView = view;
}

/** measureInWindow as a promise: { top, bottom } in window coordinates. */
function measure(view: { measureInWindow: View['measureInWindow'] } | null): Promise<{ top: number; bottom: number } | null> {
  return new Promise((resolve) => {
    if (!view) return resolve(null);
    view.measureInWindow((_x, y, _w, h) => resolve(h > 0 ? { top: y, bottom: y + h } : null));
  });
}

/** What a list hands to its editors. */
export interface KeepInViewApi {
  /** Scroll so the focused input is fully visible between the list's top and the toolbar. */
  ensure(): void;
}

/** The bits of a FlashList ref this module uses. */
interface Scrollable {
  getAbsoluteLastScrollOffset(): number;
  scrollToOffset(params: { offset: number; animated?: boolean }): void;
}

/**
 * Builds `ensure` for one list. `container` is the list's outer view (its
 * top edge is the ceiling); `list` is the FlashList, scrolled by exactly
 * the measured overlap. Refs are only read inside callbacks, never during
 * render.
 */
export function useKeepInViewController(container: RefObject<View | null>, list: RefObject<Scrollable | null>): KeepInViewApi {
  const timers = useRef<{ frame: number | null; settle: ReturnType<typeof setTimeout> | null }>({ frame: null, settle: null });

  /** One measure-and-scroll pass. */
  const pass = useCallback(async () => {
    const focused = focusedInput();
    const [input, floor, ceiling] = await Promise.all([measure(focused), measure(floorView), measure(container.current)]);
    if (!input || !floor || !ceiling || !list.current) return;
    const overlapBelow = input.bottom + MARGIN - floor.top; // hidden behind the toolbar/keyboard
    const overlapAbove = ceiling.top + MARGIN - input.top; // scrolled off the top
    const delta = overlapBelow > 0 ? overlapBelow : overlapAbove > 0 ? -overlapAbove : 0;
    if (delta === 0) return;
    // A snap, not an animation: the settle re-check must measure the final position.
    const offset = list.current.getAbsoluteLastScrollOffset();
    list.current.scrollToOffset({ offset: Math.max(0, offset + delta), animated: false });
  }, [container, list]);

  const ensure = useCallback(() => {
    // Bursts (focus + keyboard + content size) coalesce into one pass on the
    // next frame, plus one re-check once layout has settled: a just-inserted
    // row can first be placed at an estimated position.
    const t = timers.current;
    if (t.frame === null) {
      t.frame = requestAnimationFrame(() => {
        t.frame = null;
        pass();
      });
    }
    if (t.settle) clearTimeout(t.settle);
    t.settle = setTimeout(() => {
      t.settle = null;
      pass();
    }, SETTLE_MS);
  }, [pass]);

  return useMemo(() => ({ ensure }), [ensure]);
}

const KeepInViewContext = createContext<KeepInViewApi>({ ensure: () => {} });

export const KeepInViewProvider = KeepInViewContext.Provider;

/** For editors: call `ensure()` on focus and when the text box grows. */
export function useKeepInView(): KeepInViewApi {
  return useContext(KeepInViewContext);
}
