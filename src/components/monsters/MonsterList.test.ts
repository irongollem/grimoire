import { mount } from "@vue/test-utils";
import { sourceLabel } from "@/lib/library/sourceLabel";
import { useVirtualGridViewport } from "@/components/common/list/virtualGridTestViewport";
import { reactive, ref, computed, defineComponent, h } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MonsterList from "./MonsterList.vue";
import BulkSelectableCard from "@/components/common/list/BulkSelectableCard.vue";
import type { Monster } from "@/types/monster.types";

function monster(overrides: Partial<Monster> = {}): Monster {
  return {
    id: `m-${Math.random().toString(36).slice(2)}`,
    user_id: "u1",
    campaign_id: null,
    name: "Owlbear",
    monster_type: "monstrosity",
    size: "large",
    alignment: "unaligned",
    habitat: null,
    source: null,
    tags: [],
    stat_block: {
      armor_class: 13,
      hit_points: "7d10+21",
      speed: "40 ft.",
      str: 20, dex: 12, con: 17, int: 3, wis: 12, cha: 7,
      challenge_rating: "3",
    },
    notes: null,
    image_url: null,
    cutout_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_shared: false,
    ...overrides,
  } as Monster;
}

// ── Mocks ────────────────────────────────────────────────────────────────────
//
// `useMediaQuery` returns a plain `false` (not a ref) — the component's
// template only ever reads `isMobile` directly (never `.value`), so a bare
// boolean unwraps correctly and reliably forces the desktop grid branch,
// which is the one under test here (MonsterGridCard/EntityMobileCard belong
// to other files and are stubbed away below).
// FocalImage mounts the AI chip, whose module reads `useStorage`: keep the real exports.
vi.mock("@/composables/library/useSourceTitles", () => ({
  useSourceTitles: () => ({
    labelFor: (s: string | null | undefined, t?: string | null) => sourceLabel(s, t, new Map()),
  }),
}));
const viewport = vi.hoisted(() => ({ mobile: false }));
vi.mock("@vueuse/core", async (importOriginal) => {
  const { ref: vueRef } = await import("vue");
  return {
    ...(await importOriginal<typeof import("@vueuse/core")>()),
    useMediaQuery: (query: string) => vueRef(viewport.mobile && query.includes("width < 48rem")),
  };
});

const monstersData = ref<Monster[]>([]);
const PAGE = 48;
const fetchNextPage = vi.fn();
const hasNextPage = ref(false);
const browseError = ref<Error | null>(null);
const browseReady = ref(true);
const lockedData = ref<string[]>([]);
// The server pages and counts; this stand-in answers the same questions from a
// fixture: one page painted, totals and select-all over the whole result.
vi.mock("@/composables/monsters/useMonsterBrowse", () => ({
  useMonsterBrowse: () => ({
    rows: computed(() => monstersData.value.slice(0, PAGE)),
    total: computed(() => monstersData.value.length),
    scopeTotal: computed(() => monstersData.value.length + 5),
    selectableIds: computed(() => monstersData.value.filter((m) => !m.is_shared).map((m) => m.id)),
    lockedIds: computed(() => lockedData.value),
    ready: browseReady,
    hasNextPage,
    isFetchingNextPage: ref(false),
    fetchNextPage,
    isLoading: ref(false),
    error: browseError,
  }),
}));

const prefetchQuery = vi.fn();
vi.mock("@tanstack/vue-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/vue-query")>()),
  useQueryClient: () => ({ prefetchQuery }),
}));
vi.mock("@/composables/monsters/useMonsters", () => ({
  RESOLVED_MONSTER_QUERY_KEY: "resolved-monster",
  fetchResolvedMonster: vi.fn(),
}));

const discoveries = ref<{ monster_id?: string | null; library_monster_id?: string | null }[]>([]);
vi.mock("@/composables/encounters/useDiscoveredMonsters", () => ({
  useCampaignDiscoveries: () => ({ data: discoveries }),
}));

const canCreate = ref(true);
vi.mock("@/composables/billing/useQuota", () => ({
  useQuota: () => ({ canCreate, quota: ref(null) }),
}));
const routerPush = vi.fn();
vi.mock("vue-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue-router")>()),
  useRouter: () => ({ push: routerPush }),
}));

const monstersUi = {
  monstersSearch: "",
  monstersFilterType: "all",
  monstersFilterSource: "all",
};
vi.mock("@/stores/ui/monsters", () => ({ useMonstersUiStore: () => monstersUi }));

vi.mock("@/stores/campaign", () => ({
  // Wrapped in `reactive()`, exactly like a real Pinia store: `storeToRefs`
  // (used by MonsterList) needs `toRaw(store)` to still expose genuine refs
  // for `activeCampaignId`/`activeCampaign` (a plain value is silently
  // dropped from the destructure, not errored), while BulkScopeBar reads
  // `campaignStore.activeCampaignId` directly and needs the proxy's
  // read-time ref-unwrapping to hand back "camp-1" rather than the Ref
  // object itself — a bare object literal satisfies only one of the two.
  useCampaignStore: () => reactive({
    activeCampaignId: ref("camp-1"),
    activeCampaign: ref({ id: "camp-1", name: "Neverwinter" }),
  }),
}));

const mutateAsync = vi.fn().mockResolvedValue({ moved: 0 });
vi.mock("@/composables/campaign/useBulkCampaignScope", () => ({
  useBulkCampaignScope: () => ({ mutateAsync, isPending: ref(false) }),
}));

const toastSuccess = vi.fn();
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({
    success: toastSuccess,
    error: vi.fn(),
    fromError: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  }),
}));

// The dialog's own picker/plan/confirm behaviour (composables hitting
// supabase) is CopyToCampaignDialog.test.ts's job — this stand-in only lets
// this file assert the props MonsterList hands it and drive its `copied` /
// `quota-exceeded` events (#598).
vi.mock("@/components/common/overlays/CopyToCampaignDialog.vue", () => ({
  default: defineComponent({
    name: "CopyToCampaignDialog",
    props: ["open", "table", "ids", "label"],
    emits: ["close", "copied", "quota-exceeded"],
    setup(props) {
      return () => (props.open ? h("div", { class: "copy-dialog-stub" }) : null);
    },
  }),
}));

vi.mock("@/composables/useScrollRestore", () => ({
  useScrollRestore: () => ({ savedCount: undefined, linkCount: vi.fn() }),
}));

// jsdom has no layout; see the helper for what this stands in for.
useVirtualGridViewport({ viewportPx: 1000000, itemPx: 260 });

const stubs = {
  MonsterGridCard: { name: "MonsterGridCard", template: '<div class="stub-card" />', props: ["monster", "locked"] },
  EntityMobileCard: true,
  RouterLink: true,
  // Unrelated to bulk selection; it independently needs a real VueQueryPlugin
  // context (`usePlan`), which this test does not set up.
  PaywallModal: true,
};

interface MonsterListExposed {
  selecting: boolean;
  toggleSelectMode: () => void;
}

function mountList() {
  return mount(MonsterList, { global: { stubs } });
}

function exposed(wrapper: ReturnType<typeof mountList>): MonsterListExposed {
  return wrapper.vm as unknown as MonsterListExposed;
}

describe("MonsterList — bulk selection (#875)", () => {
  beforeEach(() => {
    monstersData.value = [];
    prefetchQuery.mockClear();
    fetchNextPage.mockClear();
    mutateAsync.mockClear();
    mutateAsync.mockResolvedValue({ moved: 0 });
    toastSuccess.mockClear();
  });

  it("the Select toggle shows and hides the bulk scope bar", async () => {
    monstersData.value = [monster({ id: "m1" })];
    const wrapper = mountList();
    expect(wrapper.text()).not.toContain("selected");

    await exposed(wrapper).toggleSelectMode();
    expect(wrapper.text()).toContain("0 selected");

    await exposed(wrapper).toggleSelectMode();
    expect(wrapper.text()).not.toContain("selected");
  });

  it("select-all shown selects every filtered row, not only the windowed/painted subset", async () => {
    monstersData.value = [
      ...Array.from({ length: 60 }, (_, i) => monster({ id: `custom-${i}` })),
      monster({ id: "shared-1", is_shared: true }),
      monster({ id: "shared-2", is_shared: true }),
    ];
    const wrapper = mountList();
    await flushMicrotasks(); // VirtualGrid finds its scroller on mount, rows follow
    // Only 48 are painted (the windowed page), well under the 62 total.
    expect(wrapper.findAll(".stub-card")).toHaveLength(48);

    await exposed(wrapper).toggleSelectMode();
    const selectAllBtn = wrapper.findAll("button").find((b) => b.text() === "Select all shown");
    await selectAllBtn!.trigger("click");

    // All 60 custom rows are selected despite only 48 being rendered, and the
    // 2 shared/library rows are excluded.
    expect(wrapper.text()).toContain("60 selected");
  });

  it("shows the filtered count against the whole catalogue, from the server's totals", () => {
    monstersData.value = [monster({ id: "m1" }), monster({ id: "m2" })];
    const wrapper = mountList();
    expect(wrapper.text()).toContain("2 of 7 monsters");
  });

  it("surfaces a failed read instead of an empty bestiary", () => {
    browseError.value = new Error("boom");
    const wrapper = mountList();
    expect(wrapper.text()).toContain("Could not load monsters");
    expect(wrapper.text()).toContain("boom");
    browseError.value = null;
  });

  it("warms the detail on pointer intent", async () => {
    monstersData.value = [monster({ id: "m1" })];
    const wrapper = mountList();
    await flushMicrotasks();
    await wrapper.find(".stub-card").trigger("pointerenter");
    expect(prefetchQuery).toHaveBeenCalledTimes(1);
    expect(prefetchQuery.mock.calls[0]![0].queryKey).toEqual(["resolved-monster", "m1"]);
  });

  it("clicking a card while selecting toggles it into the selection rather than navigating", async () => {
    monstersData.value = [monster({ id: "m1" }), monster({ id: "m2" }), monster({ id: "m3" })];
    const wrapper = mountList();
    await exposed(wrapper).toggleSelectMode();
    expect(wrapper.text()).toContain("0 selected");

    // BulkSelectableCard's wrapping div intercepts the click with a capturing
    // listener (`@click.capture.prevent.stop`), so a click anywhere on the
    // card — here, on the stubbed card body itself — toggles the selection
    // instead of reaching a RouterLink underneath.
    await wrapper.find(".stub-card").trigger("click");

    expect(wrapper.text()).toContain("1 selected");
  });

  it("shared/library rows are never selectable", async () => {
    monstersData.value = [
      monster({ id: "custom-1" }),
      monster({ id: "custom-2" }),
      monster({ id: "shared-1", is_shared: true }),
      monster({ id: "shared-2", is_shared: true }),
    ];
    const wrapper = mountList();
    await exposed(wrapper).toggleSelectMode();

    // Only the two custom rows grow a selection checkbox.
    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(2);

    const selectAllBtn = wrapper.findAll("button").find((b) => b.text() === "Select all shown");
    await selectAllBtn!.trigger("click");
    expect(wrapper.text()).toContain("2 selected");
  });

  it("puts the checkbox chip in the top-right corner on the desktop grid, clear of the CR badge", async () => {
    monstersData.value = [monster({ id: "m1" })];
    const wrapper = mountList();
    await exposed(wrapper).toggleSelectMode();
    expect(wrapper.findComponent(BulkSelectableCard).props("corner")).toBe("top-right");
  });

  it("moving to the active campaign calls the mutation with the table, selected ids and campaign id", async () => {
    monstersData.value = [monster({ id: "m1" }), monster({ id: "m2" }), monster({ id: "m3" })];
    mutateAsync.mockResolvedValue({ moved: 2 });
    const wrapper = mountList();
    await exposed(wrapper).toggleSelectMode();

    const boxes = wrapper.findAll('input[type="checkbox"]');
    await boxes[0]!.trigger("click");
    await boxes[1]!.trigger("click");
    expect(wrapper.text()).toContain("2 selected");

    const moveBtn = wrapper.findAll("button").find((b) => b.text() === "Move to Neverwinter");
    await moveBtn!.trigger("click");
    await flushMicrotasks();

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    const call = mutateAsync.mock.calls[0]![0] as { table: string; ids: string[]; campaignId: string | null };
    expect(call.table).toBe("monsters");
    expect(call.campaignId).toBe("camp-1");
    expect([...call.ids].sort()).toEqual(["m1", "m2"]);
  });

  it("drops a selected id when the underlying list changes (refetch/filter) (#875)", async () => {
    monstersData.value = [monster({ id: "m1" }), monster({ id: "m2" }), monster({ id: "m3" })];
    const wrapper = mountList();
    await exposed(wrapper).toggleSelectMode();

    const boxes = wrapper.findAll('input[type="checkbox"]');
    await boxes[0]!.trigger("click"); // m1
    await boxes[1]!.trigger("click"); // m2
    expect(wrapper.text()).toContain("2 selected");

    // A refetch (or a source/type filter edit) drops m2 from the list entirely.
    monstersData.value = [monster({ id: "m1" }), monster({ id: "m3" })];
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain("1 selected");
  });

  it("keeps the selection while the browse is not ready, when the stand-in ids are empty (#875)", async () => {
    monstersData.value = [monster({ id: "m1" }), monster({ id: "m2" })];
    const wrapper = mountList();
    await exposed(wrapper).toggleSelectMode();
    const selectAllBtn = wrapper.findAll("button").find((b) => b.text() === "Select all shown");
    await selectAllBtn!.trigger("click");
    expect(wrapper.text()).toContain("2 selected");

    browseReady.value = false;
    monstersData.value = [];
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain("2 selected");
  });

  it("making rows available in all campaigns calls the mutation with a null campaign id", async () => {
    monstersData.value = [monster({ id: "m1" })];
    mutateAsync.mockResolvedValue({ moved: 1 });
    const wrapper = mountList();
    await exposed(wrapper).toggleSelectMode();

    const selectAllBtn = wrapper.findAll("button").find((b) => b.text() === "Select all shown");
    await selectAllBtn!.trigger("click");

    const allCampaignsBtn = wrapper.findAll("button").find((b) => b.text() === "Make available in all campaigns");
    await allCampaignsBtn!.trigger("click");
    await flushMicrotasks();

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    const call = mutateAsync.mock.calls[0]![0] as { table: string; ids: string[]; campaignId: string | null };
    expect(call.campaignId).toBeNull();
    expect(call.ids).toEqual(["m1"]);
  });
});

describe("MonsterList — copy to campaign (#598)", () => {
  beforeEach(() => {
    monstersData.value = [];
    toastSuccess.mockClear();
  });

  it("opens the dialog with the pruned selection and the active campaign as the source scope", async () => {
    monstersData.value = [monster({ id: "m1" }), monster({ id: "m2" })];
    const wrapper = mountList();
    await exposed(wrapper).toggleSelectMode();
    const selectAllBtn = wrapper.findAll("button").find((b) => b.text() === "Select all shown");
    await selectAllBtn!.trigger("click");

    const copyBtn = wrapper.findAll("button").find((b) => b.text() === "Copy to campaign…");
    await copyBtn!.trigger("click");

    const dialog = wrapper.findComponent({ name: "CopyToCampaignDialog" });
    expect(dialog.props("open")).toBe(true);
    expect(dialog.props("table")).toBe("monsters");
    expect([...(dialog.props("ids") as string[])].sort()).toEqual(["m1", "m2"]);
    expect(dialog.props("label")).toBe("monster");
  });

  it("a copied event closes the dialog and ends selection", async () => {
    monstersData.value = [monster({ id: "m1" })];
    const wrapper = mountList();
    await exposed(wrapper).toggleSelectMode();
    const selectAllBtn = wrapper.findAll("button").find((b) => b.text() === "Select all shown");
    await selectAllBtn!.trigger("click");
    const copyBtn = wrapper.findAll("button").find((b) => b.text() === "Copy to campaign…");
    await copyBtn!.trigger("click");

    const dialog = wrapper.findComponent({ name: "CopyToCampaignDialog" });
    await dialog.vm.$emit("copied", { copied: 3, linked: 0, targetName: "Neverwinter" });

    expect(wrapper.findComponent({ name: "CopyToCampaignDialog" }).props("open")).toBe(false);
    expect(wrapper.text()).not.toContain("selected");
  });

  it("a quota-exceeded event closes the dialog and opens the paywall, reusing the existing modal", async () => {
    monstersData.value = [monster({ id: "m1" })];
    const wrapper = mountList();
    await exposed(wrapper).toggleSelectMode();
    const selectAllBtn = wrapper.findAll("button").find((b) => b.text() === "Select all shown");
    await selectAllBtn!.trigger("click");
    const copyBtn = wrapper.findAll("button").find((b) => b.text() === "Copy to campaign…");
    await copyBtn!.trigger("click");

    const dialog = wrapper.findComponent({ name: "CopyToCampaignDialog" });
    await dialog.vm.$emit("quota-exceeded");

    expect(wrapper.findComponent({ name: "CopyToCampaignDialog" }).props("open")).toBe(false);
    expect(wrapper.findComponent({ name: "PaywallModal" }).props("modelValue")).toBe(true);
    // Only one PaywallModal instance exists on this page — it's shared with
    // the create flow, not a second copy.
    expect(wrapper.findAllComponents({ name: "PaywallModal" })).toHaveLength(1);
  });
});

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("MonsterList — empty states and locked rows", () => {
  beforeEach(() => {
    monstersData.value = [];
    lockedData.value = [];
    canCreate.value = true;
    routerPush.mockReset();
    monstersUi.monstersSearch = "";
    monstersUi.monstersFilterType = "all";
    monstersUi.monstersFilterSource = "all";
  });

  it("invites the first custom monster when the custom filter is empty, and goes to the editor", async () => {
    monstersUi.monstersFilterSource = "custom";
    const wrapper = mountList();
    expect(wrapper.text()).toContain("No custom monsters yet");
    await wrapper.findAll("button").find((b) => b.text() === "Add your first monster")!.trigger("click");
    expect(routerPush).toHaveBeenCalledWith("/monsters/new");
  });

  it("opens the paywall instead of the editor at the plan's monster limit", async () => {
    monstersUi.monstersFilterSource = "custom";
    canCreate.value = false;
    const wrapper = mountList();
    await wrapper.findAll("button").find((b) => b.text() === "Add your first monster")!.trigger("click");
    expect(routerPush).not.toHaveBeenCalled();
    expect(wrapper.findComponent({ name: "PaywallModal" }).props("modelValue")).toBe(true);
  });

  it("says no monsters match, not that there are none, when a search or type filter is on", () => {
    monstersUi.monstersFilterSource = "custom";
    monstersUi.monstersSearch = "dragon";
    expect(mountList().text()).toContain("No monsters match your filters.");
    monstersUi.monstersSearch = "";
    monstersUi.monstersFilterType = "beast";
    expect(mountList().text()).toContain("No monsters match your filters.");
    expect(mountList().text()).not.toContain("No custom monsters yet");
  });

  it("hands the card the server's quota lock, for the rows it names only", async () => {
    monstersData.value = [monster({ id: "m1" }), monster({ id: "m2" })];
    lockedData.value = ["m2"];
    const wrapper = mountList();
    await flushMicrotasks();
    const locks = wrapper.findAllComponents({ name: "MonsterGridCard" }).map((c) => c.props("locked"));
    expect(locks).toEqual([false, true]);
  });
});

describe("MonsterList on a phone — which cards say they are shared with the players", () => {
  beforeEach(() => {
    viewport.mobile = true;
    monstersData.value = [monster({ id: "own-1" }), monster({ id: "own-2" }), monster({ id: "lib-1", is_shared: true }), monster({ id: "lib-2", is_shared: true })];
    discoveries.value = [{ monster_id: "own-1", library_monster_id: null }, { monster_id: null, library_monster_id: "lib-1" }];
  });
  afterEach(() => {
    viewport.mobile = false;
    discoveries.value = [];
  });

  it("marks a monster discovered under its own id, and a library monster under the library id, and no other", async () => {
    const wrapper = mount(MonsterList, { global: { stubs: { ...stubs, EntityMobileCard: { name: "EntityMobileCard", props: ["title", "shared"], template: "<div class='mobile-card' />" } } } });
    await flushMicrotasks();
    const shared = wrapper.findAllComponents({ name: "EntityMobileCard" }).map((c) => [c.props("title"), c.props("shared")]);
    expect(shared.length).toBe(4);
    expect(shared.map(([, s]) => s)).toEqual([true, false, true, false]);
  });

  it("does not take a library id for an own monster's discovery", async () => {
    discoveries.value = [{ monster_id: null, library_monster_id: "own-1" }];
    const wrapper = mount(MonsterList, { global: { stubs: { ...stubs, EntityMobileCard: { name: "EntityMobileCard", props: ["title", "shared"], template: "<div class='mobile-card' />" } } } });
    await flushMicrotasks();
    expect(wrapper.findAllComponents({ name: "EntityMobileCard" }).every((c) => c.props("shared") === false)).toBe(true);
  });
});
