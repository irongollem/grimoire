import { ref, computed, watch, onUnmounted, type Ref } from "vue";

/**
 * Client-side infinite scroll over an already-fetched filtered list.
 *
 * Usage:
 *   const { visibleItems, sentinelRef } = useInfiniteScroll(filtered)
 *
 *   // template: v-for="x in visibleItems" ... <div ref="sentinelRef" />
 *
 * Resets to the first page whenever `filtered` changes (search / filter update).
 * Uses IntersectionObserver on the sentinel element to load the next page.
 */
export function useInfiniteScroll<T>(filtered: Ref<T[]>, pageSize = 48) {
  const visibleCount = ref(pageSize);
  const sentinelRef = ref<HTMLElement | null>(null);

  const visibleItems = computed(() => filtered.value.slice(0, visibleCount.value));
  const hasMore = computed(() => visibleCount.value < filtered.value.length);

  // Reset to first page whenever the source list changes (filter / search)
  watch(filtered, () => { visibleCount.value = pageSize; });

  let observer: IntersectionObserver | null = null;

  watch(sentinelRef, (el) => {
    observer?.disconnect();
    if (!el) return;
    observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore.value) {
          visibleCount.value += pageSize;
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
  });

  onUnmounted(() => observer?.disconnect());

  return { visibleItems, sentinelRef, hasMore };
}
