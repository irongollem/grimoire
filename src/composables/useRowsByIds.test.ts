import { defineComponent, h, nextTick, ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { normaliseIds, useRowsByIds } from "@/composables/useRowsByIds";

let gate: Promise<void> | null = null;
const fetchRows = vi.fn(async ([ids]: string[][]) => {
  const rows = new Map(ids.map((id) => [id, { id }]));
  if (gate) await gate;
  return rows;
});

beforeEach(() => {
  fetchRows.mockClear();
  gate = null;
});

function run(list: () => string[], opts: { client?: QueryClient; enabled?: () => boolean } = {}) {
  const client = opts.client ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let out!: ReturnType<typeof useRowsByIds<{ id: string }>>;
  mount(
    defineComponent({
      setup() {
        out = useRowsByIds<{ id: string }>({
          keyRoot: ["things", "by-ids"],
          idLists: () => [normaliseIds(list())],
          fetch: fetchRows,
          enabled: opts.enabled,
        });
        return () => h("div");
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient: client }]] } },
  );
  return { ...out, client };
}

describe("normaliseIds", () => {
  it("sorts, dedupes and drops null, undefined and empty ids", () => {
    expect(normaliseIds(["b", null, "a", "b", "", undefined])).toEqual(["a", "b"]);
  });
});

describe("useRowsByIds", () => {
  it("reuses one cache entry for the same ids listed in another order", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    run(() => ["b", "a"], { client });
    await flushPromises();
    run(() => ["a", "b"], { client });
    await flushPromises();
    expect(fetchRows).toHaveBeenCalledTimes(1);
  });

  it("sends nothing and returns an empty map for no ids", async () => {
    const { data } = run(() => []);
    await flushPromises();
    expect(fetchRows).not.toHaveBeenCalled();
    expect(data.value.size).toBe(0);
  });

  it("sends nothing while the caller has it disabled", async () => {
    run(() => ["a"], { enabled: () => false });
    await flushPromises();
    expect(fetchRows).not.toHaveBeenCalled();
  });

  it("keeps resolved rows, and isLoading false, while a grown id set loads", async () => {
    const list = ref(["a"]);
    const { data, isLoading } = run(() => list.value);
    await flushPromises();
    let release!: () => void;
    gate = new Promise<void>((r) => (release = r));
    list.value = ["a", "b"];
    await nextTick();
    expect(isLoading.value).toBe(false);
    expect([...data.value.keys()]).toEqual(["a"]);
    release();
    await flushPromises();
    expect([...data.value.keys()].sort()).toEqual(["a", "b"]);
  });

  it("never shows an id that is no longer requested while a placeholder is up", async () => {
    const list = ref(["a", "b"]);
    const { data } = run(() => list.value);
    await flushPromises();
    gate = new Promise<void>(() => {});
    list.value = ["b", "c"];
    await nextTick();
    expect([...data.value.keys()]).toEqual(["b"]);
  });

  it("yields an empty map once every id is removed", async () => {
    const list = ref(["a"]);
    const { data } = run(() => list.value);
    await flushPromises();
    list.value = [];
    await flushPromises();
    expect(data.value.size).toBe(0);
  });
});
