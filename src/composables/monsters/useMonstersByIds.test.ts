import { defineComponent, h, nextTick, ref, type Ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

type Call = { table: string; select: string; eq: [string, unknown][]; in: [string, unknown[]][] };
const mocks = vi.hoisted(() => ({ calls: [] as Call[], rows: {} as Record<string, Record<string, unknown>[]>, gate: null as Promise<void> | null }));

vi.mock("@/lib/supabase", () => {
  const builder = (table: string) => {
    const call: Call = { table, select: "", eq: [], in: [] };
    mocks.calls.push(call);
    const b: Promise<{ data: unknown[]; error: null }> & Record<string, unknown> = Object.assign(
      new Promise<{ data: unknown[]; error: null }>((resolve) => {
        // Resolve after the chain has been built so `in` has been recorded.
        void (mocks.gate ?? Promise.resolve()).then(() => {
          const ids = new Set(call.in.flatMap(([, v]) => v));
          const rows = (mocks.rows[table] ?? []).filter((r) => ids.size === 0 || ids.has(String(r.id ?? r.entry_id)));
          resolve({ data: rows, error: null });
        });
      }),
      {} as Record<string, unknown>,
    );
    b.select = (s: string) => ((call.select = s), b);
    b.eq = (c: string, v: unknown) => (call.eq.push([c, v]), b);
    b.in = (c: string, v: unknown[]) => (call.in.push([c, v]), b);
    return b;
  };
  return { getCurrentUser: () => ({ id: "user-1" }), supabase: { from: builder } };
});

import { useMonstersByIds } from "./useMonstersByIds";

const UUID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const UUID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function run<T>(setup: () => T): T {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let out!: T;
  mount(
    defineComponent({
      setup() {
        out = setup();
        return () => h("div");
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
  );
  return out;
}

beforeEach(() => {
  mocks.calls.length = 0;
  mocks.gate = null;
  mocks.rows = {
    library_monsters: [
      { id: "srd_wolf", name: "Wolf", image_url: "lib.webp", portrait_focal_point: null },
      { id: "srd_bear", name: "Bear", image_url: "bear.webp", portrait_focal_point: null },
    ],
    monsters: [{ id: UUID_A, name: "Homebrew", image_url: null }],
    library_monster_art_canonical: [
      { entry_id: "srd_wolf", image_url: "art.webp", cutout_url: null, portrait_focal_point: null },
      { entry_id: "srd_bear", image_url: "bear-art.webp", cutout_url: null, portrait_focal_point: null },
    ],
    library_monster_art: [],
  };
});

describe("useMonstersByIds", () => {
  it("sends nothing for an empty or all-null list", async () => {
    const { data } = run(() => useMonstersByIds([null, undefined]));
    await flushPromises();
    expect(mocks.calls).toEqual([]);
    expect(data.value.size).toBe(0);
  });

  it("splits library ids from uuids, applies no source, ruleset or campaign filter, and maps both sides", async () => {
    const { data } = run(() => useMonstersByIds(["srd_wolf", UUID_A, "srd_wolf", null]));
    await flushPromises();
    const lib = mocks.calls.find((c) => c.table === "library_monsters");
    const custom = mocks.calls.find((c) => c.table === "monsters");
    expect(lib?.in).toEqual([["id", ["srd_wolf"]]]);
    expect(custom?.in).toEqual([["id", [UUID_A]]]);
    expect(lib?.eq).toEqual([]);
    expect(custom?.eq).toEqual([]);
    expect(data.value.get("srd_wolf")?.is_shared).toBe(true);
    expect(data.value.get(UUID_A)?.name).toBe("Homebrew");
    expect(mocks.calls.some((c) => c.table.startsWith("library_monster_art"))).toBe(false);
  });

  it("only touches the table a list needs", async () => {
    run(() => useMonstersByIds([UUID_A]));
    await flushPromises();
    expect(mocks.calls.map((c) => c.table)).toEqual(["monsters"]);
  });

  it("chunks long id lists at 100", async () => {
    const ids = Array.from({ length: 230 }, (_, i) => `srd_m${String(i).padStart(3, "0")}`);
    run(() => useMonstersByIds(ids));
    await flushPromises();
    const lib = mocks.calls.filter((c) => c.table === "library_monsters");
    expect(lib.map((c) => c.in[0]![1].length)).toEqual([100, 100, 30]);
  });

  it("merges library art when asked, with a caller-scoped override read", async () => {
    const { data } = run(() => useMonstersByIds(["srd_wolf"], { withArt: true }));
    await flushPromises();
    expect(data.value.get("srd_wolf")?.image_url).toBe("art.webp");
    const own = mocks.calls.find((c) => c.table === "library_monster_art");
    expect(own?.in).toEqual([["entry_id", ["srd_wolf"]]]);
    expect(own?.eq).toEqual([["user_id", "user-1"]]);
  });

  it("does not refetch when the same ids arrive in another order", async () => {
    const list: Ref<string[]> = ref([UUID_B, UUID_A]);
    run(() => useMonstersByIds(list));
    await flushPromises();
    const before = mocks.calls.length;
    list.value = [UUID_A, UUID_B];
    await flushPromises();
    expect(mocks.calls.length).toBe(before);
  });

  it("keeps resolved monsters with their art, and isLoading false, while a grown id set loads", async () => {
    const list = ref(["srd_wolf"]);
    const { data, isLoading } = run(() => useMonstersByIds(list, { withArt: true }));
    await flushPromises();
    let release!: () => void;
    mocks.gate = new Promise<void>((r) => (release = r));
    list.value = ["srd_wolf", "srd_bear"];
    await nextTick();
    expect(isLoading.value).toBe(false);
    expect([...data.value.keys()]).toEqual(["srd_wolf"]);
    expect(data.value.get("srd_wolf")?.image_url).toBe("art.webp");
    release();
    await flushPromises();
    expect([...data.value.keys()].sort()).toEqual(["srd_bear", "srd_wolf"]);
    expect(data.value.get("srd_bear")?.image_url).toBe("bear-art.webp");
  });

  it("never shows an id that is no longer requested while a placeholder is up", async () => {
    const list = ref(["srd_wolf", UUID_A]);
    const { data } = run(() => useMonstersByIds(list));
    await flushPromises();
    mocks.gate = new Promise<void>(() => {});
    list.value = [UUID_A, "srd_bear"];
    await nextTick();
    expect([...data.value.keys()]).toEqual([UUID_A]);
  });

  it("yields an empty map once every id is removed", async () => {
    const list = ref(["srd_wolf"]);
    const { data } = run(() => useMonstersByIds(list, { withArt: true }));
    await flushPromises();
    list.value = [];
    await flushPromises();
    expect(data.value.size).toBe(0);
  });
});
