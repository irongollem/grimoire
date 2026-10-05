import { describe, expect, it, vi, afterEach } from "vitest";
import { effectScope, nextTick, ref } from "vue";
import { nextBrowseOffset, useSettledSearch } from "./useCatalogueBrowse";

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
