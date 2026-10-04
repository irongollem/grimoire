import { defineComponent, h, ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

type Call = { table: string; select: string; eq: [string, unknown][]; or: string[]; is: [string, unknown][]; in: [string, unknown][] };
const mocks = vi.hoisted(() => ({
  calls: [] as Call[],
  rows: {} as Record<string, unknown[]>,
  slugs: null as { value: string[] | null } | null,
}));

vi.mock("@/lib/supabase", () => {
  const builder = (table: string) => {
    const call: Call = { table, select: "", eq: [], or: [], is: [], in: [] };
    mocks.calls.push(call);
    const result = () => Promise.resolve({ data: mocks.rows[table] ?? [], error: null });
    const b: Promise<{ data: unknown[]; error: null }> & Record<string, unknown> = Object.assign(result(), {} as Record<string, unknown>);
    b.select = (s: string) => ((call.select = s), b);
    b.eq = (c: string, v: unknown) => (call.eq.push([c, v]), b);
    b.or = (f: string) => (call.or.push(f), b);
    b.is = (c: string, v: unknown) => (call.is.push([c, v]), b);
    b.in = (c: string, v: unknown) => (call.in.push([c, v]), b);
    b.order = () => b;
    return b;
  };
  return { getCurrentUser: () => ({ id: "user-1" }), supabase: { from: builder } };
});
vi.mock("@/composables/library/useEnabledSources", () => ({
  useLibrarySourceSlugs: () => ({ slugs: ref<string[] | null>(["srd-2024"]), isLoading: ref(false) }),
}));
vi.mock("@/composables/rules/useRuleset", () => ({ useTableRuleset: () => ({ ruleset: ref("2024") }) }));
const campaign = vi.hoisted(() => ({ id: null as string | null }));
// storeToRefs only keeps refs, so the mocked store holds a real one.
vi.mock("@/stores/campaign", async () => {
  const { ref: vueRef } = await import("vue");
  return {
    useCampaignStore: () => {
      return { activeCampaignId: vueRef<string | null>(campaign.id) };
    },
  };
});

import { useMonsterIndex } from "./useMonsterIndex";

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

const entry = (id: string, name: string) => ({
  id, name, monster_type: "beast", size: "medium", source: "x", image_url: null, challenge_rating: "1",
});

beforeEach(() => {
  mocks.calls.length = 0;
  mocks.rows = {};
  campaign.id = null;
});

describe("useMonsterIndex", () => {
  it("reads slim columns from the library, filtered by sources and ruleset", async () => {
    run(() => useMonsterIndex());
    await flushPromises();
    const lib = mocks.calls.find((c) => c.table === "library_monsters");
    expect(lib?.select).toBe(
      "id, name, monster_type, size, source, image_url, challenge_rating:stat_block->>challenge_rating",
    );
    expect(lib?.select).not.toContain("*");
    expect(lib?.in).toEqual([["source", ["srd-2024"]]]);
    expect(lib?.eq).toEqual([["ruleset", "2024"]]);
  });

  it("scopes custom monsters to the caller, the campaign and its globals, the ruleset, and not open5e imports", async () => {
    campaign.id = "camp-1";
    run(() => useMonsterIndex());
    await flushPromises();
    const custom = mocks.calls.find((c) => c.table === "monsters");
    expect(custom?.select).not.toContain("*");
    expect(custom?.select).toContain("challenge_rating:stat_block->>challenge_rating");
    expect(custom?.eq).toEqual([["user_id", "user-1"]]);
    expect(custom?.or).toEqual([
      "open5e_import.is.null,open5e_import.eq.false",
      "ruleset.is.null,ruleset.eq.2024",
      "campaign_id.eq.camp-1,campaign_id.is.null",
    ]);
  });

  it("with no active campaign reads only the global custom monsters", async () => {
    run(() => useMonsterIndex());
    await flushPromises();
    const custom = mocks.calls.find((c) => c.table === "monsters");
    expect(custom?.is).toEqual([["campaign_id", null]]);
    expect(custom?.or.some((f) => f.startsWith("campaign_id"))).toBe(false);
  });

  it("merges library then custom, sorted by name, without deduping, marking shared rows", async () => {
    mocks.rows.library_monsters = [entry("srd_wolf", "Wolf"), entry("srd_ape", "Ape")];
    mocks.rows.monsters = [{ ...entry("11111111-1111-1111-1111-111111111111", "Wolf"), campaign_id: "camp-1" }];
    const { data } = run(() => useMonsterIndex());
    await flushPromises();
    expect(data.value?.map((m) => [m.name, m.id, m.is_shared, m.campaign_id])).toEqual([
      ["Ape", "srd_ape", true, null],
      ["Wolf", "srd_wolf", true, null],
      ["Wolf", "11111111-1111-1111-1111-111111111111", false, "camp-1"],
    ]);
  });

  it("sends nothing while disabled", async () => {
    const { data } = run(() => useMonsterIndex(() => ({ enabled: false })));
    await flushPromises();
    expect(mocks.calls).toEqual([]);
    expect(data.value).toBeUndefined();
  });
});
