import { defineComponent, h, ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});

vi.mock("@/lib/supabase", () => ({ getCurrentUser: () => ({ id: "user-1" }), supabase: fake.client }));
vi.mock("@/composables/library/useEnabledSources", () => ({
  useLibrarySourceSlugs: () => ({ slugs: ref<string[] | null>(["srd-2024"]), isLoading: ref(false) }),
}));
vi.mock("@/composables/rules/useRuleset", () => ({ useRuleset: () => ({ ruleset: ref("2024") }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "camp-1" }) }));

import { useSpellIndex } from "@/composables/spells/useSpellIndex";

function run(getOptions?: () => { enabled?: boolean }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let result!: ReturnType<typeof useSpellIndex>;
  mount(
    defineComponent({
      setup() {
        result = useSpellIndex(getOptions);
        return () => h("div");
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
  );
  return { result, queryClient };
}

beforeEach(() => fake.reset());

const lib = (id: string, name: string, level: number, over: Record<string, unknown> = {}) =>
  ({ id, name, level, school: "evocation", source: "srd-2024", ruleset: "2024", classes: [], ...over });

describe("useSpellIndex", () => {
  it("reads only the enabled sources' spells of the active ruleset", async () => {
    fake.seed("library_spells", [
      lib("srd_in", "In", 1),
      lib("srd_old", "Old rules", 1, { ruleset: "2014" }),
      lib("kp_off", "Other book", 1, { source: "kobold-press" }),
    ]);
    const { result } = run();
    await flushPromises();
    expect(result.data.value?.map((s) => s.id)).toEqual(["srd_in"]);
  });

  // spells_select lets a player read the DM's homebrew through a shared
  // campaign, so a user_id filter here would hide it. The scope is the campaign
  // and the ruleset (an `or` the fake does not interpret, so the request itself
  // is the property).
  it("scopes custom spells by campaign and ruleset, never by user, and skips legacy open5e imports", async () => {
    fake.seed("spells", [
      { id: "c1", name: "Mine", level: 1, school: "evocation", source: null, classes: [], campaign_id: "camp-1", open5e_import: false },
      { id: "c2", name: "Imported", level: 1, school: "evocation", source: null, classes: [], campaign_id: "camp-1", open5e_import: true },
    ]);
    const { result } = run();
    await flushPromises();
    expect(result.data.value?.map((s) => s.id)).toEqual(["c1"]);

    const custom = fake.calls.find((c) => c.target === "spells")!;
    expect(custom.filters.filter((f) => f.op === "or").map((f) => f.value)).toEqual([
      "ruleset.is.null,ruleset.eq.2024",
      "campaign_id.is.null,campaign_id.eq.camp-1",
    ]);
    expect(fake.calls.flatMap((c) => c.filters).some((f) => f.column === "user_id")).toBe(false);
  });

  it("merges library and custom rows sorted by level then name", async () => {
    fake.seed("library_spells", [
      lib("srd_b", "Bless", 1, { school: "enchantment" }),
      lib("srd_a", "Light", 0),
    ]);
    fake.seed("spells", [
      { id: "c1", name: "Alarm", level: 1, school: "abjuration", source: null, classes: [], campaign_id: "camp-1", open5e_import: false },
    ]);
    const { result } = run();
    await flushPromises();
    expect(result.data.value?.map((s) => s.id)).toEqual(["srd_a", "c1", "srd_b"]);
    expect(result.data.value?.map((s) => s.is_shared)).toEqual([true, false, true]);
    expect(result.data.value?.[1]?.campaign_id).toBe("camp-1");
  });

  it("sends nothing when disabled", async () => {
    const { result } = run(() => ({ enabled: false }));
    await flushPromises();
    expect(fake.calls).toEqual([]);
    expect(result.data.value).toBeUndefined();
  });

  it("keys the library cache outside the library-spells prefix", async () => {
    const { queryClient } = run();
    await flushPromises();
    const keys = queryClient.getQueryCache().getAll().map((q) => q.queryKey[0]);
    expect(keys).toContain("library-spell-index");
    expect(keys).not.toContain("library-spells");
  });
});
