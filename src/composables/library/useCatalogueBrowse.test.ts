import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { describe, expect, it, vi, afterEach } from "vitest";
import { defineComponent, effectScope, nextTick, ref } from "vue";
import { nextBrowseOffset, useCatalogueBrowse, useSettledSearch } from "./useCatalogueBrowse";

const rows = (n: number) => Array.from({ length: n }, (_, i) => i);

describe("nextBrowseOffset", () => {
  it("returns the loaded count while the first page's total is not reached", () => {
    const pages = [{ rows: rows(48), total: 100 }, { rows: rows(48) }];
    expect(nextBrowseOffset(pages[1]!, pages)).toBe(96);
  });

  it("stops at the total", () => {
    const pages = [{ rows: rows(48), total: 60 }, { rows: rows(12) }];
    expect(nextBrowseOffset(pages[1]!, pages)).toBeUndefined();
  });

  it("stops on an empty page even when the total says more", () => {
    const pages = [{ rows: rows(48), total: 100 }, { rows: [] }];
    expect(nextBrowseOffset(pages[1]!, pages)).toBeUndefined();
  });

  it("reads the total from page 1, not from a later page without one", () => {
    const pages = [{ rows: rows(48), total: 50 }, { rows: rows(2) }];
    expect(nextBrowseOffset(pages[1]!, pages)).toBeUndefined();
  });
});

describe("useSettledSearch", () => {
  afterEach(() => vi.useRealTimers());

  it("waits for a pause, trimmed, and clears immediately", async () => {
    vi.useFakeTimers();
    const raw = ref("");
    const scope = effectScope();
    const settled = scope.run(() => useSettledSearch(() => raw.value, 250))!;
    raw.value = " owl ";
    await nextTick();
    expect(settled.value).toBe("");
    vi.advanceTimersByTime(249);
    expect(settled.value).toBe("");
    vi.advanceTimersByTime(1);
    expect(settled.value).toBe("owl");
    raw.value = "";
    await nextTick();
    expect(settled.value).toBe("");
    scope.stop();
  });

  it("restarts the pause on each keystroke, so only the last text is searched", async () => {
    vi.useFakeTimers();
    const raw = ref("");
    const scope = effectScope();
    const settled = scope.run(() => useSettledSearch(() => raw.value, 250))!;
    raw.value = "o";
    await nextTick();
    vi.advanceTimersByTime(200);
    raw.value = "ow";
    await nextTick();
    vi.advanceTimersByTime(200);
    expect(settled.value).toBe("");
    vi.advanceTimersByTime(50);
    expect(settled.value).toBe("ow");
    scope.stop();
  });

  it("drops a pending update when its scope is disposed", async () => {
    vi.useFakeTimers();
    const raw = ref("");
    const scope = effectScope();
    const settled = scope.run(() => useSettledSearch(() => raw.value, 250))!;
    raw.value = "owl";
    await nextTick();
    scope.stop();
    vi.advanceTimersByTime(500);
    expect(settled.value).toBe("");
  });
});

describe("useCatalogueBrowse", () => {
  afterEach(() => vi.useRealTimers());

  // 5 rows per filter, served 2 at a time, tagged with the filter so a stale grid is visible.
  const serve = (filter: string, offset: number) => {
    const all = Array.from({ length: 5 }, (_, i) => `${filter}${i}`);
    return { rows: all.slice(offset, offset + 2), ...(offset === 0 ? { total: all.length } : {}) };
  };

  function mountBrowse(filter: { value: string }, enabled: () => boolean = () => true) {
    let out!: ReturnType<typeof useCatalogueBrowse<string, { rows: string[]; total?: number }>>;
    const gate: { release?: () => void; hold: boolean } = { hold: false };
    mount(
      defineComponent({
        setup() {
          out = useCatalogueBrowse<string, { rows: string[]; total?: number }>({
            queryKey: () => ["browse", filter.value],
            fetchPage: async (offset) => {
              if (gate.hold && offset === 0) await new Promise<void>((resolve) => { gate.release = resolve; });
              return serve(filter.value, offset);
            },
            enabled,
          });
          return () => null;
        },
      }),
      { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] } },
    );
    return { browse: out, gate };
  }

  it("pages in as asked and stops at the total", async () => {
    const { browse } = mountBrowse(ref("a"));
    await flushPromises();
    expect(browse.rows.value).toEqual(["a0", "a1"]);
    expect(browse.first.value?.total).toBe(5);
    expect(browse.hasNextPage.value).toBe(true);
    await browse.fetchNextPage();
    await browse.fetchNextPage();
    expect(browse.rows.value).toEqual(["a0", "a1", "a2", "a3", "a4"]);
    expect(browse.hasNextPage.value).toBe(false);
  });

  it("keeps the previous grid on screen, not ready, until the new filter's first page lands", async () => {
    const filter = ref("a");
    const { browse, gate } = mountBrowse(filter);
    await flushPromises();
    expect(browse.ready.value).toBe(true);
    gate.hold = true;
    filter.value = "b";
    await flushPromises();
    expect(browse.rows.value).toEqual(["a0", "a1"]);
    expect(browse.ready.value).toBe(false);
    gate.release?.();
    await flushPromises();
    expect(browse.rows.value).toEqual(["b0", "b1"]);
    expect(browse.ready.value).toBe(true);
  });

  it("reads nothing while disabled", async () => {
    const { browse } = mountBrowse(ref("a"), () => false);
    await flushPromises();
    expect(browse.rows.value).toEqual([]);
    expect(browse.ready.value).toBe(false);
  });
});
