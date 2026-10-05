import { defineComponent, h, ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

const mocks = vi.hoisted(() => ({
  calls: [] as { table: string; ops: [string, unknown[]][] }[],
  rows: {} as Record<string, unknown[]>,
}));

vi.mock("@/lib/supabase", () => ({
  getCurrentUser: () => ({ id: "user-1" }),
  supabase: {
    from: (table: string) => {
      const call = { table, ops: [] as [string, unknown[]][] };
      mocks.calls.push(call);
      const b: Promise<{ data: unknown[]; error: null }> & Record<string, unknown> = Object.assign(
        Promise.resolve({ data: mocks.rows[table] ?? [], error: null }),
        {} as Record<string, unknown>,
      );
      for (const m of ["select", "eq", "in", "or", "is", "order", "range"]) {
        b[m] = (...args: unknown[]) => {
          call.ops.push([m, args]);
          return b;
        };
      }
      return b;
    },
  },
}));
vi.mock("@/composables/library/useEnabledSources", () => ({
  useLibrarySourceSlugs: () => ({ slugs: ref<string[] | null>(["srd-2024"]), isLoading: ref(false) }),
}));
vi.mock("@/composables/rules/useRuleset", () => ({ useTableRuleset: () => ({ ruleset: ref("2024") }) }));
vi.mock("pinia", async (orig) => ({ ...(await orig<typeof import("pinia")>()), storeToRefs: (s: unknown) => s }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: ref("camp-1") }) }));

import { useItemIndex } from "@/composables/items/useItemIndex";
import type { ItemIndexEntry } from "@/types/item.types";

function entry(over: Partial<ItemIndexEntry>): Record<string, unknown> {
  return {
    id: "x", name: "X", item_type: "weapon", tags: [], rarity: "common", source: null,
    source_document_key: null, source_record_key: null, image_url: null, ruleset: null, ...over,
  };
}

function run<T>(setup: () => T): T {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let out!: T;
  mount(
    defineComponent({ setup() { out = setup(); return () => h("div"); } }),
    { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
  );
  return out;
}

beforeEach(() => {
  mocks.calls.length = 0;
  mocks.rows = {};
});

describe("useItemIndex (#972)", () => {
  it("reads slim columns, scoped to the caller, campaign and edition", async () => {
    run(() => useItemIndex());
    await flushPromises();
    const lib = mocks.calls.find((c) => c.table === "library_items");
    const own = mocks.calls.find((c) => c.table === "items");
    expect(lib?.ops).toContainEqual(["in", ["source_document_key", ["grimoire-bundled", "srd-2024"]]]);
    expect(lib?.ops).toContainEqual(["or", ["ruleset.is.null,ruleset.eq.2024"]]);
    const cols = lib?.ops.find(([m]) => m === "select")?.[1][0];
    expect(cols).not.toBe("*");
    expect(cols).toContain("item_type");
    expect(cols).toContain("rarity");
    expect(own?.ops).toContainEqual(["eq", ["user_id", "user-1"]]);
    expect(own?.ops).toContainEqual(["or", ["campaign_id.eq.camp-1,campaign_id.is.null"]]);
    expect(own?.ops).toContainEqual(["or", ["ruleset.is.null,ruleset.eq.2024"]]);
  });

  it("merges library and own rows by name; an own copy shadows its library twin, homebrew does not", async () => {
    mocks.rows.library_items = [
      entry({ id: "srd_rope", name: "Rope", source: "srd-2024", source_document_key: "srd-2024", source_record_key: "rope" }),
      entry({ id: "srd_sword", name: "Longsword", source: "srd-2024", source_document_key: "srd-2024", source_record_key: "longsword" }),
    ];
    mocks.rows.items = [
      entry({ id: "u-rope", name: "Rope", source: "srd-2024", source_document_key: "srd-2024", source_record_key: "rope", campaign_id: null }),
      entry({ id: "u-sword", name: "Longsword", campaign_id: "camp-1" }),
    ];
    const { data } = run(() => useItemIndex());
    await flushPromises();
    expect(data.value?.map((i) => [i.id, i.is_shared])).toEqual([
      ["srd_sword", true],
      ["u-sword", false],
      ["u-rope", false],
    ]);
    expect(data.value?.find((i) => i.id === "srd_sword")?.campaign_id).toBeNull();
  });

  it("sends nothing while disabled", async () => {
    run(() => useItemIndex(() => ({ enabled: false })));
    await flushPromises();
    expect(mocks.calls).toEqual([]);
  });
});
