import { computed, onBeforeUnmount, ref, watch, type Ref } from "vue";
import { useScrollRestore } from "@/composables/useScrollRestore";

interface ServerInfiniteScrollOptions {
  /** Key for `useScrollRestore`: one per list view. */
  scrollKey: string;
  loadedCount: () => number;
  /** False while page 1 of the current filters is still loading. */
  ready: Readonly<Ref<boolean>>;
  hasNextPage: Readonly<Ref<boolean>>;
  isFetchingNextPage: Readonly<Ref<boolean>>;
  fetchNextPage: () => unknown;
}

/**
 * The sentinel under a server-paged list: asks for the next page as it nears
 * the viewport. An IntersectionObserver only reports a *change*, so the
 * sentinel is re-observed after every page lands; a page too short to push it
 * out of view then keeps loading instead of stalling. Also restores depth on
 * return from a detail: pages load until the saved count is back, so the saved
 * scroll position lands on a list of the same height.
 */
export function useServerInfiniteScroll(o: ServerInfiniteScrollOptions) {
  const sentinelRef = ref<HTMLElement | null>(null);
  let observer: IntersectionObserver | null = null;

  function loadMore() {
    if (o.hasNextPage.value && !o.isFetchingNextPage.value) void o.fetchNextPage();
  }

  watch(sentinelRef, (el) => {
    observer?.disconnect();
    observer = null;
    if (!el) return;
    observer = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) loadMore(); },
      { rootMargin: "200px" },
    );
    observer.observe(el);
  });
  watch(o.loadedCount, () => {
    const el = sentinelRef.value;
    if (!observer || !el) return;
    observer.unobserve(el);
    observer.observe(el);
  });
  onBeforeUnmount(() => observer?.disconnect());

  const { savedCount, linkCount } = useScrollRestore(o.scrollKey);
  linkCount(computed(() => o.loadedCount()));
  let restoringDepth = !!savedCount;
  watch([o.ready, o.loadedCount, o.hasNextPage], ([isReady, count, more]) => {
    if (!restoringDepth || !isReady || savedCount === undefined) return;
    if (count >= savedCount || !more) { restoringDepth = false; return; }
    loadMore();
  }, { immediate: true });

  return { sentinelRef };
}
