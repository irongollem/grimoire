import { getCurrentInstance, onMounted, onBeforeUnmount, nextTick, type Ref } from "vue";
import { onBeforeRouteLeave } from "vue-router";
import type { ComponentPublicInstance } from "vue";
import { scrollParentOf } from "@/lib/scrollParent";

/**
 * Persists the scroll position (and, for a server-paged list, how many rows
 * were loaded) for a list view so that navigating List → Detail → Back
 * restores exactly where the user was.
 *
 * Usage A — a server-paged list. The scroll position is only meaningful once
 * the list is as long as it was, so the loaded count is linked and
 * `useServerInfiniteScroll` (which calls this itself) pages back to it:
 *
 *   const { sentinelRef } = useServerInfiniteScroll({ scrollKey: 'monsters', loadedCount, ... })
 *
 * Usage A2 — a client list rendered through VirtualGrid. The whole filtered
 * list is present at once, so only the scroll position is restored and the
 * count is ignored:
 *
 *   useScrollRestore('npcs')
 *
 * Usage B — inside a view that renders its list content directly (no child list component):
 *
 *   const listRef = ref<HTMLElement | null>(null)
 *   useScrollRestore('hall-of-heroes', listRef)
 *   // In template: wrap the list body in <div ref="listRef">
 *
 * The composable auto-detects the active scroll container at runtime by
 * walking up the DOM from either the provided `startRef` element or the
 * component's own root element. This correctly resolves to the inner
 * `lg:overflow-y-auto` div inside ListPageLayout on desktop, and to the
 * `<main>` element (DefaultLayout) on mobile.
 *
 * State is kept in a module-level Map (session memory only, never persisted
 * to localStorage) so it survives in-session navigation but is reset on
 * hard refresh.
 */

interface State {
  scrollTop: number;
  count: number;
}

const states = new Map<string, State>();

export function useScrollRestore(
  key: string,
  /** Optional ref to an element inside the scroll container — use this when
   *  calling from a view that renders list content directly rather than
   *  delegating to a child list component. */
  startRef?: Ref<HTMLElement | ComponentPublicInstance | null>,
) {
  const instance = getCurrentInstance();
  let scrollEl: Element | null = null;
  let countRef: Ref<number> | null = null;

  /**
   * Link the number of loaded rows of a server-paged list so that the current
   * depth is included in the saved state.
   */
  function linkCount(ref: Ref<number>) {
    countRef = ref;
  }

  function save() {
    if (!scrollEl) return;
    states.set(key, {
      scrollTop: scrollEl.scrollTop,
      count: countRef?.value ?? states.get(key)?.count ?? 0,
    });
  }

  onMounted(async () => {
    // Prefer the explicitly provided startRef (handles views that render list
    // content directly and need a reference point inside the scroll container).
    // Fall back to the component's own root element.
    const rawRef = startRef?.value;
    const root: Element | null =
      rawRef
        ? ("$el" in rawRef ? (rawRef.$el as Element) : rawRef)
        : (instance?.proxy?.$el as Element | null);
    if (root) scrollEl = scrollParentOf(root);

    const saved = states.get(key);
    if (saved?.scrollTop) {
      await nextTick();
      if (scrollEl) scrollEl.scrollTop = saved.scrollTop;
    }
  });

  onBeforeRouteLeave(save);
  onBeforeUnmount(save);

  /**
   * The loaded count that was active when the user left the list.
   * `useServerInfiniteScroll` pages back to it before the scroll position is
   * restored, so the list is the same height again.
   */
  const savedCount = states.get(key)?.count;

  return { savedCount, linkCount };
}
