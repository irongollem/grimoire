import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { useMonsterBrowse, type MonsterBrowseFilters } from "./useMonsterBrowse";

const rpc = vi.fn();
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

const slugs = ref<string[] | null>(["srd-2014"]);
vi.mock("@/composables/library/useEnabledSources", () => ({
  useLibrarySourceSlugs: () => ({ slugs }),
}));
vi.mock("@/composables/rules/useRuleset", () => ({
  useTableRuleset: () => ({ ruleset: ref("2014") }),
}));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "camp-1" }) }));
const quota = ref<{ unlimited: boolean; current: number; limit: number } | null>(null);
vi.mock("@/composables/billing/useQuota", () => ({ useQuota: () => ({ quota }) }));

function row(id: string) {
  return { id, name: id, size: "large", monster_type: "beast", habitat: null, source: null, source_title: null,
    is_shared: true, tags: [], image_url: null, portrait_focal_point: null,
    challenge_rating: "1", armor_class: 12, hit_points: "10" };
}
function page(ids: string[], total: number) {
  return { data: { rows: ids.map(row), total, scope_total: 99, selectable_ids: ["own-1"], locked_ids: ["own-2"] }, error: null };
}

const filters = ref<MonsterBrowseFilters>({ search: "", source: "all", type: "all" });

const mounted: Array<{ unmount: () => void }> = [];

function mountBrowse() {
  let api!: ReturnType<typeof useMonsterBrowse>;
  const wrapper = mount(
    defineComponent({ setup() { api = useMonsterBrowse(filters); return () => h("div"); } }),
    { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]] } },
  );
  mounted.push(wrapper);
  return { api, wrapper };
}

describe("useMonsterBrowse", () => {
  beforeEach(() => {
    rpc.mockReset();
    slugs.value = ["srd-2014"];
    quota.value = null;
    filters.value = { search: "", source: "all", type: "all" };
  });
  afterEach(() => {
    vi.useRealTimers();
    mounted.splice(0).forEach((w) => w.unmount());
  });

  it("maps filters and scope to the rpc params", async () => {
    rpc.mockResolvedValue(page(["a"], 1));
    filters.value = { search: "  owl ", source: "custom", type: "beast" };
    quota.value = { unlimited: false, current: 7, limit: 5 };
    vi.useFakeTimers();
    mountBrowse();
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();
    expect(rpc).toHaveBeenCalledWith("browse_monsters", {
      p_slugs: ["srd-2014"], p_ruleset: "2014", p_campaign_id: "camp-1", p_search: "owl",
      p_source: "custom", p_type: "beast", p_limit: 48, p_offset: 0, p_lock_count: 2,
    });
  });

  it("sends null for no search and no type, and no lock when unlimited", async () => {
    rpc.mockResolvedValue(page(["a"], 1));
    quota.value = { unlimited: true, current: 0, limit: -1 };
    mountBrowse();
    await flushPromises();
    const params = rpc.mock.calls[0]![1];
    expect(params.p_search).toBeNull();
    expect(params.p_type).toBeNull();
    expect(params.p_lock_count).toBe(0);
  });

  it("takes totals and id lists from the first page and pages by loaded count", async () => {
    const first = Array.from({ length: 48 }, (_, i) => `a${i}`);
    rpc.mockResolvedValueOnce(page(first, 60));
    const { api } = mountBrowse();
    await flushPromises();
    expect(api.rows.value).toHaveLength(48);
    expect(api.total.value).toBe(60);
    expect(api.scopeTotal.value).toBe(99);
    expect(api.selectableIds.value).toEqual(["own-1"]);
    expect(api.lockedIds.value).toEqual(["own-2"]);
    expect(api.hasNextPage.value).toBe(true);

    rpc.mockResolvedValueOnce({ data: { rows: Array.from({ length: 12 }, (_, i) => row(`b${i}`)) }, error: null });
    await api.fetchNextPage();
    await flushPromises();
    expect(rpc.mock.calls[1]![1].p_offset).toBe(48);
    expect(api.rows.value).toHaveLength(60);
    expect(api.total.value).toBe(60);
    expect(api.selectableIds.value).toEqual(["own-1"]);
    expect(api.lockedIds.value).toEqual(["own-2"]);
    expect(api.hasNextPage.value).toBe(false);
  });

  it("stays idle while the enabled sources are unknown", async () => {
    slugs.value = null;
    const { api } = mountBrowse();
    await flushPromises();
    expect(rpc).not.toHaveBeenCalled();
    expect(api.isLoading.value).toBe(true);
    slugs.value = ["srd-2014"];
    rpc.mockResolvedValue(page(["a"], 1));
    await flushPromises();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("debounces typing into one request", async () => {
    rpc.mockResolvedValue(page(["a"], 1));
    vi.useFakeTimers();
    mountBrowse();
    await vi.advanceTimersByTimeAsync(0);
    rpc.mockClear();
    filters.value = { ...filters.value, search: "o" };
    await nextTick();
    filters.value = { ...filters.value, search: "ow" };
    await vi.advanceTimersByTimeAsync(100);
    expect(rpc).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0]![1].p_search).toBe("ow");
  });

  it("surfaces an rpc error", async () => {
    rpc.mockResolvedValue({ data: null, error: new Error("denied") });
    const { api } = mountBrowse();
    await flushPromises();
    expect(api.error.value?.message).toBe("denied");
  });
});
