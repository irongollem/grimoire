import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";

const saved = vi.hoisted(() => ({ count: undefined as number | undefined }));
vi.mock("@/composables/useScrollRestore", () => ({
  useScrollRestore: () => ({ savedCount: saved.count, linkCount: vi.fn() }),
}));

import { useServerInfiniteScroll } from "./useServerInfiniteScroll";

const observers: StubObserver[] = [];
class StubObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  constructor(public cb: (e: Array<{ isIntersecting: boolean }>) => void) { observers.push(this); }
}
vi.stubGlobal("IntersectionObserver", StubObserver);

function mountScroll(initialSaved?: number, more = true) {
  saved.count = initialSaved;
  const loaded = ref(48);
  const ready = ref(true);
  const hasNextPage = ref(more);
  const isFetchingNextPage = ref(false);
  const fetchNextPage = vi.fn(() => { loaded.value += 48; });
  const wrapper = mount(defineComponent({
    setup() {
      const { sentinelRef } = useServerInfiniteScroll({
        scrollKey: "t", loadedCount: () => loaded.value,
        ready, hasNextPage, isFetchingNextPage, fetchNextPage,
      });
      return () => h("div", [h("div", { ref: sentinelRef })]);
    },
  }));
  return { wrapper, loaded, hasNextPage, fetchNextPage };
}

describe("useServerInfiniteScroll", () => {
  beforeEach(() => { observers.length = 0; });

  it("loads the next page when the sentinel intersects", async () => {
    const { fetchNextPage } = mountScroll();
    await nextTick();
    observers[0]!.cb([{ isIntersecting: true }]);
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("re-observes the sentinel when the loaded count grows", async () => {
    const { loaded } = mountScroll();
    await nextTick();
    const o = observers[0]!;
    expect(o.observe).toHaveBeenCalledTimes(1);
    loaded.value = 96;
    await nextTick();
    expect(o.unobserve).toHaveBeenCalledTimes(1);
    expect(o.observe).toHaveBeenCalledTimes(2);
  });

  it("disconnects on unmount", async () => {
    const { wrapper } = mountScroll();
    await nextTick();
    wrapper.unmount();
    expect(observers[0]!.disconnect).toHaveBeenCalled();
  });

  it("restores depth by loading pages until the saved count, then stops", async () => {
    const { fetchNextPage, loaded } = mountScroll(144);
    await nextTick();
    await nextTick();
    expect(loaded.value).toBe(144);
    // 48 -> 96 -> 144: two pages, then it stops at the saved count.
    expect(fetchNextPage).toHaveBeenCalledTimes(2);
  });

  it("stops restoring when there are no more pages", async () => {
    const { fetchNextPage } = mountScroll(500, false);
    await nextTick();
    expect(fetchNextPage).not.toHaveBeenCalled();
  });
});
