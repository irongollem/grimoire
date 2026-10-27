import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { defineComponent, h, nextTick, ref, shallowRef } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { useMonsterBrowse, type MonsterBrowseFilters } from "./useMonsterBrowse";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));

// shallow: the fake clones rpc args, and a reactive proxy cannot be structured-cloned.
const slugs = shallowRef<string[] | null>(["srd-2014"]);
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
  return { rows: ids.map(row), total, scope_total: 99, selectable_ids: ["own-1"], locked_ids: ["own-2"] };
}
/** The args each browse request carried; the rpc takes UI state (a trimmed search, a quota overage) as parameters, so they are the property. */
const requests = () => fake.calls.filter((c) => c.kind === "rpc").map((c) => c.payload as Record<string, unknown>);
function serve(...pages: unknown[]) {
  let next = 0;
  fake.onRpc("browse_monsters", () => pages[Math.min(next++, pages.length - 1)]);
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
    fake.reset();
    slugs.value = ["srd-2014"];
    quota.value = null;
    filters.value = { search: "", source: "all", type: "all" };
  });
  afterEach(() => {
    vi.useRealTimers();
    mounted.splice(0).forEach((w) => w.unmount());
  });

  it("sends the search trimmed, the chosen source and type, and the campaign and ruleset the table plays", async () => {
    serve(page(["a"], 1));
    filters.value = { search: "  owl ", source: "custom", type: "beast" };
    vi.useFakeTimers();
    mountBrowse();
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();
    expect(requests()[0]).toMatchObject({
      p_slugs: ["srd-2014"], p_ruleset: "2014", p_campaign_id: "camp-1", p_search: "owl", p_source: "custom", p_type: "beast",
    });
  });

  it("sends null for no search and for the all-types choice", async () => {
    serve(page(["a"], 1));
    mountBrowse();
    await flushPromises();
    expect(requests()[0]).toMatchObject({ p_search: null, p_type: null });
  });

  // app convention: a monster quota's overage locks the newest rows; an unlimited plan, a
  // missing quota, or one still under its limit locks nothing.
  it.each([
    ["over the limit by two", { unlimited: false, current: 7, limit: 5 }, 2],
    ["under the limit", { unlimited: false, current: 3, limit: 5 }, 0],
    ["unlimited", { unlimited: true, current: 0, limit: -1 }, 0],
    ["not loaded yet", null, 0],
  ])("locks %s -> %i rows", async (_label, q, locked) => {
    serve(page(["a"], 1));
    quota.value = q;
    mountBrowse();
    await flushPromises();
    expect(requests()[0]?.p_lock_count).toBe(locked);
  });

  it("takes totals and id lists from the first page and pages by loaded count", async () => {
    const first = Array.from({ length: 48 }, (_, i) => `a${i}`);
    serve(page(first, 60), { rows: Array.from({ length: 12 }, (_, i) => row(`b${i}`)) });
    const { api } = mountBrowse();
    await flushPromises();
    expect(api.rows.value).toHaveLength(48);
    expect(api.total.value).toBe(60);
    expect(api.scopeTotal.value).toBe(99);
    expect(api.selectableIds.value).toEqual(["own-1"]);
    expect(api.lockedIds.value).toEqual(["own-2"]);
    expect(api.hasNextPage.value).toBe(true);

    await api.fetchNextPage();
    await flushPromises();
    expect(requests()[1]?.p_offset).toBe(48);
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
    expect(requests()).toEqual([]);
    expect(api.isLoading.value).toBe(true);
    slugs.value = ["srd-2014"];
    serve(page(["a"], 1));
    await flushPromises();
    expect(requests()).toHaveLength(1);
  });

  it("debounces typing into one request", async () => {
    serve(page(["a"], 1));
    vi.useFakeTimers();
    mountBrowse();
    await vi.advanceTimersByTimeAsync(0);
    fake.calls.length = 0;
    filters.value = { ...filters.value, search: "o" };
    await nextTick();
    filters.value = { ...filters.value, search: "ow" };
    await vi.advanceTimersByTimeAsync(100);
    expect(requests()).toEqual([]);
    await vi.advanceTimersByTimeAsync(300);
    expect(requests()).toHaveLength(1);
    expect(requests()[0]?.p_search).toBe("ow");
  });

  it("surfaces an rpc error", async () => {
    fake.failNext("browse_monsters", { message: "denied" });
    const { api } = mountBrowse();
    await flushPromises();
    expect(api.error.value?.message).toBe("denied");
  });
});
