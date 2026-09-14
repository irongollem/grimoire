import { mount } from "@vue/test-utils";
import { reactive, ref, computed, defineComponent, h, type Ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MonsterList from "./MonsterList.vue";
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
vi.mock("@vueuse/core", () => ({ useMediaQuery: () => false }));

const monstersData = ref<Monster[]>([]);
vi.mock("@/composables/monsters/useMonsters", () => ({
  useAllMonsters: () => ({ data: monstersData, isLoading: ref(false) }),
}));

vi.mock("@/composables/encounters/useDiscoveredMonsters", () => ({
  useCampaignDiscoveries: () => ({ data: ref([]) }),
}));

vi.mock("@/composables/billing/useQuota", () => ({
  useQuota: () => ({ canCreate: ref(true), quota: ref(null) }),
}));

const ui = {
  monstersSearch: "",
  monstersFilterType: "all",
  monstersFilterSource: "all",
  entityListLayout: "rows",
};
vi.mock("@/stores/ui", () => ({ useUiStore: () => ui }));

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
vi.mock("@/components/common/CopyToCampaignDialog.vue", () => ({
  default: defineComponent({
    name: "CopyToCampaignDialog",
    props: ["open", "table", "ids", "sourceCampaignId", "label"],
    emits: ["close", "copied", "quota-exceeded"],
    setup(props) {
      return () => (props.open ? h("div", { class: "copy-dialog-stub" }) : null);
    },
  }),
}));

// Windowing over `filtered` without IntersectionObserver — mirrors the real
// composable's slicing so a >pageSize fixture still exercises "select all
// shown selects everything filtered, not only what's painted."
vi.mock("@/composables/useInfiniteScroll", () => ({
  useInfiniteScroll: (filtered: Ref<Monster[]>, pageSize = 48) => ({
    visibleItems: computed(() => filtered.value.slice(0, pageSize)),
    sentinelRef: ref(null),
    visibleCount: ref(Math.min(pageSize, filtered.value.length)),
  }),
}));
vi.mock("@/composables/useScrollRestore", () => ({
  useScrollRestore: () => ({ savedCount: undefined, linkCount: vi.fn() }),
}));

const stubs = {
  MonsterGridCard: { template: '<div class="stub-card" />', props: ["monster", "locked"] },
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
    // Only 48 are painted (the windowed page), well under the 62 total.
    expect(wrapper.findAll(".stub-card")).toHaveLength(48);

    await exposed(wrapper).toggleSelectMode();
    const selectAllBtn = wrapper.findAll("button").find((b) => b.text() === "Select all shown");
    await selectAllBtn!.trigger("click");

    // All 60 custom rows are selected despite only 48 being rendered, and the
    // 2 shared/library rows are excluded.
    expect(wrapper.text()).toContain("60 selected");
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

  it("prunes a stale id when the underlying list changes (refetch/filter) before the move (#875)", async () => {
    monstersData.value = [monster({ id: "m1" }), monster({ id: "m2" }), monster({ id: "m3" })];
    mutateAsync.mockResolvedValue({ moved: 1 });
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

    const moveBtn = wrapper.findAll("button").find((b) => b.text() === "Move to Neverwinter");
    await moveBtn!.trigger("click");
    await flushMicrotasks();

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    const call = mutateAsync.mock.calls[0]![0] as { table: string; ids: string[]; campaignId: string | null };
    expect(call.ids).toEqual(["m1"]);
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
    // The source is the active campaign, not any row's own scope — the one
    // destination never offered is the campaign the DM is already standing in.
    expect(dialog.props("sourceCampaignId")).toBe("camp-1");
    expect(dialog.props("label")).toBe("monster");
  });

  it("prunes a stale id at copy time exactly like move (#875)", async () => {
    monstersData.value = [monster({ id: "m1" }), monster({ id: "m2" }), monster({ id: "m3" })];
    const wrapper = mountList();
    await exposed(wrapper).toggleSelectMode();
    const boxes = wrapper.findAll('input[type="checkbox"]');
    await boxes[0]!.trigger("click"); // m1
    await boxes[1]!.trigger("click"); // m2

    monstersData.value = [monster({ id: "m1" }), monster({ id: "m3" })];
    await wrapper.vm.$nextTick();

    const copyBtn = wrapper.findAll("button").find((b) => b.text() === "Copy to campaign…");
    await copyBtn!.trigger("click");

    expect(wrapper.findComponent({ name: "CopyToCampaignDialog" }).props("ids")).toEqual(["m1"]);
  });

  it("a copied event toasts the count and destination, closes the dialog, and clears the selection", async () => {
    monstersData.value = [monster({ id: "m1" })];
    const wrapper = mountList();
    await exposed(wrapper).toggleSelectMode();
    const selectAllBtn = wrapper.findAll("button").find((b) => b.text() === "Select all shown");
    await selectAllBtn!.trigger("click");
    const copyBtn = wrapper.findAll("button").find((b) => b.text() === "Copy to campaign…");
    await copyBtn!.trigger("click");

    const dialog = wrapper.findComponent({ name: "CopyToCampaignDialog" });
    await dialog.vm.$emit("copied", { copied: 3, targetName: "Neverwinter" });

    expect(toastSuccess).toHaveBeenCalledWith("Copied 3 monsters to Neverwinter.");
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
