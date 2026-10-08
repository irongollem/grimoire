import { defineComponent, h, ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  slugs: { value: ["srd-2014"] as string[] | null },
}));

vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "camp-1" }) }));
vi.mock("@/composables/rules/useRuleset", () => ({ useRuleset: () => ({ ruleset: { value: "2014" } }) }));
vi.mock("@/composables/library/useEnabledSources", () => ({
  useLibrarySourceSlugs: () => ({ slugs: mocks.slugs }),
}));

import { useSpellBrowse, type SpellBrowseFilters } from "@/composables/spells/useSpellBrowse";

function row(id: string) {
  return {
    id, name: id, level: 1, school: "evocation", ritual: false, casting_time: "1 action",
    range: "60 feet", components: [], concentration: false, classes: [], tags: [],
    source: null, source_title: null, source_url: null, is_shared: false, is_own: true,
  };
}

const base: SpellBrowseFilters = { search: "", level: "", school: "", class: "", source: "all" };

function setup(filters: SpellBrowseFilters) {
  let result!: ReturnType<typeof useSpellBrowse>;
  const f = ref(filters);
  const Host = defineComponent({
    setup() {
      result = useSpellBrowse(() => f.value);
      return () => h("div");
    },
  });
  mount(Host, { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]] } });
  return { get: () => result, f };
}

describe("useSpellBrowse", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.slugs.value = ["srd-2014"];
  });

  it("sends the filters as rpc arguments and pages by loaded count", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: { rows: [row("a"), row("b")], total: 3, selectable_ids: ["a"] }, error: null })
      .mockResolvedValueOnce({ data: { rows: [row("c")] }, error: null });
    const { get } = setup({ ...base, search: " fire ", level: "0", school: "evocation", class: "Wizard" });
    await flushPromises();

    expect(mocks.rpc).toHaveBeenCalledWith("browse_spells", {
      p_slugs: ["srd-2014"], p_ruleset: "2014", p_campaign_id: "camp-1",
      p_search: "fire", p_level: 0, p_school: "evocation", p_class: "Wizard",
      p_source: "all", p_limit: 48, p_offset: 0, p_extra_ids: null,
    });
    expect(get().rows.value).toHaveLength(2);
    expect(get().total.value).toBe(3);
    expect(get().selectableIds.value).toEqual(["a"]);
    expect(get().hasNextPage.value).toBe(true);

    await get().fetchNextPage();
    await flushPromises();
    expect(mocks.rpc.mock.calls[1][1].p_offset).toBe(2);
    expect(get().rows.value.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(get().total.value).toBe(3);
    expect(get().selectableIds.value).toEqual(["a"]);
    expect(get().hasNextPage.value).toBe(false);
  });

  it("passes a subclass's expanded list as extra ids for the class filter", async () => {
    mocks.rpc.mockResolvedValue({ data: { rows: [], total: 0, selectable_ids: [] }, error: null });
    setup({ ...base, class: "Warlock", extraIds: ["srd_bless", "srd_command"] });
    await flushPromises();
    expect(mocks.rpc.mock.calls[0][1].p_extra_ids).toEqual(["srd_bless", "srd_command"]);
  });

  it("does not query until the enabled sources are known", async () => {
    mocks.slugs.value = null;
    const { get } = setup(base);
    await flushPromises();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(get().isLoading.value).toBe(true);
  });

  it("surfaces an rpc error", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: new Error("boom") });
    const { get } = setup(base);
    await flushPromises();
    expect(get().error.value).toBeTruthy();
  });
});
