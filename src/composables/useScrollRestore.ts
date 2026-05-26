import { getCurrentInstance, onMounted, onBeforeUnmount, nextTick, type Ref } from "vue";
import { onBeforeRouteLeave } from "vue-router";

/**
 * Persists the scroll position (and infinite-scroll page count) for a list
 * view so that navigating List → Detail → Back restores exactly where the
 * user was.
 *
 * Usage — inside the list component (e.g. NpcList.vue):
 *
 *   const { savedCount, linkCount } = useScrollRestore('npcs')
 *   const { visibleItems, sentinelRef, visibleCount } = useInfiniteScroll(filtered, 48, savedCount)
 *   linkCount(visibleCount)
 *
 * The composable auto-detects the active scroll container at runtime by
 * walking up the DOM — this correctly resolves to the inner
 * `lg:overflow-y-auto` div inside ListPageLayout on desktop, and to the
 * `<main>` element (DefaultLayout) on mobile, with no manual wiring needed.
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

function findScrollParent(el: Element): Element | null {
  let node: Element | null = el.parentElement;
  while (node && node !== document.documentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll") return node;
    node = node.parentElement;
  }
  return null;
}

export function useScrollRestore(key: string) {
  const instance = getCurrentInstance();
  let scrollEl: Element | null = null;
  let countRef: Ref<number> | null = null;

  /**
   * Link the `visibleCount` ref returned by useInfiniteScroll so that the
   * current page depth is included in the saved state.
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
    const root = instance?.proxy?.$el as Element | null;
    if (root) scrollEl = findScrollParent(root);

    const saved = states.get(key);
    if (saved?.scrollTop) {
      await nextTick();
      if (scrollEl) scrollEl.scrollTop = saved.scrollTop;
    }
  });

  onBeforeRouteLeave(save);
  onBeforeUnmount(save);

  /**
   * The visibleCount that was active when the user left the list.
   * Pass this as `initialCount` to useInfiniteScroll so the same number of
   * items are rendered before the scroll position is restored.
   */
  const savedCount = states.get(key)?.count;

  return { savedCount, linkCount };
}
