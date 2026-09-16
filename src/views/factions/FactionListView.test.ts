import { mount } from "@vue/test-utils";
import { reactive, ref, computed, defineComponent, h, type Ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FactionListView from "./FactionListView.vue";
import BulkSelectableCard from "@/components/common/BulkSelectableCard.vue";
import type { Faction } from "@/types/faction.types";

function faction(overrides: Partial<Faction> = {}): Faction {
  return {
    id: `f-${Math.random().toString(36).slice(2)}`,
    user_id: "u1",
    campaign_id: "camp-1",
    name: "The Iron Circle",
    faction_type: "Guild",
    description: null,
    emblem_url: null,
    alignment: null,
    player_visible_to: [],
    tags: [],
    setting_source: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  } as Faction;
}

// ── Mocks ────────────────────────────────────────────────────────────────────

const factionsData = ref<Faction[]>([]);
vi.mock("@/composables/factions/useFactions", () => ({
  useAllFactions: () => ({ data: factionsData, isLoading: ref(false) }),
  usePopulateFactions: () => ({ isPending: ref(false), mutateAsync: vi.fn() }),
  useUpdateFaction: () => ({ mutate: vi.fn() }),
}));

vi.mock("@/settings/index", () => ({ getSetting: () => null }));

const ui = {
  factionsSearch: "",
  factionsFilterType: "",
  factionsHasActiveFilters: false,
  resetFactionsFilters: vi.fn(),
};
vi.mock("@/stores/ui", () => ({ useUiStore: () => ui }));

vi.mock("@/stores/campaign", () => ({
  // Wrapped in `reactive()`, matching the real Pinia-store shape so
  // `campaign.activeCampaign` reads back the object rather than a Ref.
  useCampaignStore: () => reactive({
    activeCampaignId: ref("camp-1"),
    activeCampaign: ref({ id: "camp-1", name: "Neverwinter" }),
  }),
}));

vi.mock("@/composables/billing/useCreateGate", () => ({
  useCreateGate: () => ({
    canCreate: ref(true),
    showPaywall: ref(false),
    handleNew: vi.fn(),
    gateQuotaError: () => false,
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
// this file assert the props FactionListView hands it and drive its
// `copied` / `quota-exceeded` events (#885).
vi.mock("@/components/common/CopyToCampaignDialog.vue", () => ({
  default: defineComponent({
    name: "CopyToCampaignDialog",
    props: ["open", "table", "ids", "label"],
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
  useInfiniteScroll: (filtered: Ref<Faction[]>, pageSize = 48) => ({
    visibleItems: computed(() => filtered.value.slice(0, pageSize)),
    sentinelRef: ref(null),
    visibleCount: ref(Math.min(pageSize, filtered.value.length)),
  }),
}));
vi.mock("@/composables/useScrollRestore", () => ({
  useScrollRestore: () => ({ savedCount: undefined, linkCount: vi.fn() }),
}));

const stubs = {
  EntityListRow: { template: '<div class="stub-card"><slot name="actions" /></div>' },
  AudienceRevealControl: true,
  RouterLink: true,
  // Unrelated to bulk selection; it independently needs a real VueQueryPlugin
  // context (`usePlan`), which this test does not set up.
  PaywallModal: true,
};

interface FactionListExposed {
  selecting: boolean;
}

function mountView() {
  return mount(FactionListView, { global: { stubs } });
}

function exposed(wrapper: ReturnType<typeof mountView>): FactionListExposed {
  return wrapper.vm as unknown as FactionListExposed;
}

async function toggleSelecting(wrapper: ReturnType<typeof mountView>) {
  const selectBtn = wrapper.findAll("button").find((b) => b.text().includes("Select"));
  await selectBtn!.trigger("click");
}

describe("FactionListView — bulk selection (#885)", () => {
  beforeEach(() => {
    factionsData.value = [];
    mutateAsync.mockClear();
    mutateAsync.mockResolvedValue({ moved: 0 });
    toastSuccess.mockClear();
  });

  it("the Select toggle shows and hides the bulk scope bar", async () => {
    factionsData.value = [faction({ id: "f1" })];
    const wrapper = mountView();
    expect(wrapper.text()).not.toContain("selected");

    await toggleSelecting(wrapper);
    expect(wrapper.text()).toContain("0 selected");
    expect(exposed(wrapper).selecting).toBe(true);

    await toggleSelecting(wrapper);
    expect(wrapper.text()).not.toContain("selected");
  });

  it("select-all shown selects every filtered row, not only the windowed/painted subset", async () => {
    factionsData.value = Array.from({ length: 60 }, (_, i) => faction({ id: `faction-${i}`, name: `Faction ${i}` }));
    const wrapper = mountView();
    // Only 48 are painted (the windowed page), well under the 60 total.
    expect(wrapper.findAll(".stub-card")).toHaveLength(48);

    await toggleSelecting(wrapper);
    const selectAllBtn = wrapper.findAll("button").find((b) => b.text() === "Select all shown");
    await selectAllBtn!.trigger("click");

    expect(wrapper.text()).toContain("60 selected");
  });

  it("clicking a row while selecting toggles it into the selection rather than navigating", async () => {
    factionsData.value = [faction({ id: "f1" }), faction({ id: "f2" }), faction({ id: "f3" })];
    const wrapper = mountView();
    await toggleSelecting(wrapper);
    expect(wrapper.text()).toContain("0 selected");

    // BulkSelectableCard's wrapping div intercepts the click with a capturing
    // listener (`@click.capture.prevent.stop`), so a click anywhere on the
    // row — here, on the stubbed row body itself — toggles the selection
    // instead of reaching the RouterLink overlay underneath.
    await wrapper.find(".stub-card").trigger("click");

    expect(wrapper.text()).toContain("1 selected");
  });

  it("every faction row is selectable — no shared/library concept for factions", async () => {
    factionsData.value = [faction({ id: "f1" }), faction({ id: "f2" }), faction({ id: "f3" })];
    const wrapper = mountView();
    await toggleSelecting(wrapper);

    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(3);
  });

  it("puts the checkbox chip top-left, over the emblem tile rather than the trailing reveal/chevron group", async () => {
    factionsData.value = [faction({ id: "f1" })];
    const wrapper = mountView();
    await toggleSelecting(wrapper);
    expect(wrapper.findComponent(BulkSelectableCard).props("corner")).toBe("top-left");
  });

  it("moving to the active campaign calls the mutation with the table, selected ids and campaign id", async () => {
    factionsData.value = [faction({ id: "f1" }), faction({ id: "f2" }), faction({ id: "f3" })];
    mutateAsync.mockResolvedValue({ moved: 2 });
    const wrapper = mountView();
    await toggleSelecting(wrapper);

    const boxes = wrapper.findAll('input[type="checkbox"]');
    await boxes[0]!.trigger("click");
    await boxes[1]!.trigger("click");
    expect(wrapper.text()).toContain("2 selected");

    const moveBtn = wrapper.findAll("button").find((b) => b.text() === "Move to Neverwinter");
    await moveBtn!.trigger("click");
    await flushMicrotasks();

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    const call = mutateAsync.mock.calls[0]![0] as { table: string; ids: string[]; campaignId: string | null };
    expect(call.table).toBe("factions");
    expect(call.campaignId).toBe("camp-1");
    expect([...call.ids].sort()).toEqual(["f1", "f2"]);
  });

  it("prunes a stale id when the underlying list changes (refetch/filter) before the move (#875)", async () => {
    factionsData.value = [faction({ id: "f1" }), faction({ id: "f2" }), faction({ id: "f3" })];
    mutateAsync.mockResolvedValue({ moved: 1 });
    const wrapper = mountView();
    await toggleSelecting(wrapper);

    const boxes = wrapper.findAll('input[type="checkbox"]');
    await boxes[0]!.trigger("click"); // f1
    await boxes[1]!.trigger("click"); // f2
    expect(wrapper.text()).toContain("2 selected");

    // A refetch (or a filter edit) drops f2 from the list entirely.
    factionsData.value = [faction({ id: "f1" }), faction({ id: "f3" })];
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain("1 selected");

    const moveBtn = wrapper.findAll("button").find((b) => b.text() === "Move to Neverwinter");
    await moveBtn!.trigger("click");
    await flushMicrotasks();

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    const call = mutateAsync.mock.calls[0]![0] as { table: string; ids: string[]; campaignId: string | null };
    expect(call.ids).toEqual(["f1"]);
  });

  it("making rows available in all campaigns calls the mutation with a null campaign id", async () => {
    factionsData.value = [faction({ id: "f1" })];
    mutateAsync.mockResolvedValue({ moved: 1 });
    const wrapper = mountView();
    await toggleSelecting(wrapper);

    const selectAllBtn = wrapper.findAll("button").find((b) => b.text() === "Select all shown");
    await selectAllBtn!.trigger("click");

    const allCampaignsBtn = wrapper.findAll("button").find((b) => b.text() === "Make available in all campaigns");
    await allCampaignsBtn!.trigger("click");
    await flushMicrotasks();

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    const call = mutateAsync.mock.calls[0]![0] as { table: string; ids: string[]; campaignId: string | null };
    expect(call.campaignId).toBeNull();
    expect(call.ids).toEqual(["f1"]);
  });
});

describe("FactionListView — copy to campaign (#885)", () => {
  beforeEach(() => {
    factionsData.value = [];
    toastSuccess.mockClear();
  });

  it("opens the dialog with the pruned selection", async () => {
    factionsData.value = [faction({ id: "f1" }), faction({ id: "f2" })];
    const wrapper = mountView();
    await toggleSelecting(wrapper);
    const selectAllBtn = wrapper.findAll("button").find((b) => b.text() === "Select all shown");
    await selectAllBtn!.trigger("click");

    const copyBtn = wrapper.findAll("button").find((b) => b.text() === "Copy to campaign…");
    await copyBtn!.trigger("click");

    const dialog = wrapper.findComponent({ name: "CopyToCampaignDialog" });
    expect(dialog.props("open")).toBe(true);
    expect(dialog.props("table")).toBe("factions");
    expect([...(dialog.props("ids") as string[])].sort()).toEqual(["f1", "f2"]);
    expect(dialog.props("label")).toBe("faction");
  });

  it("prunes a stale id at copy time exactly like move (#875)", async () => {
    factionsData.value = [faction({ id: "f1" }), faction({ id: "f2" }), faction({ id: "f3" })];
    const wrapper = mountView();
    await toggleSelecting(wrapper);
    const boxes = wrapper.findAll('input[type="checkbox"]');
    await boxes[0]!.trigger("click"); // f1
    await boxes[1]!.trigger("click"); // f2

    factionsData.value = [faction({ id: "f1" }), faction({ id: "f3" })];
    await wrapper.vm.$nextTick();

    const copyBtn = wrapper.findAll("button").find((b) => b.text() === "Copy to campaign…");
    await copyBtn!.trigger("click");

    expect(wrapper.findComponent({ name: "CopyToCampaignDialog" }).props("ids")).toEqual(["f1"]);
  });

  it("a copied event toasts the count and destination, closes the dialog, and clears the selection", async () => {
    factionsData.value = [faction({ id: "f1" })];
    const wrapper = mountView();
    await toggleSelecting(wrapper);
    const selectAllBtn = wrapper.findAll("button").find((b) => b.text() === "Select all shown");
    await selectAllBtn!.trigger("click");
    const copyBtn = wrapper.findAll("button").find((b) => b.text() === "Copy to campaign…");
    await copyBtn!.trigger("click");

    const dialog = wrapper.findComponent({ name: "CopyToCampaignDialog" });
    await dialog.vm.$emit("copied", { copied: 3, targetName: "Neverwinter" });

    expect(toastSuccess).toHaveBeenCalledWith("Copied 3 factions to Neverwinter.");
    expect(wrapper.findComponent({ name: "CopyToCampaignDialog" }).props("open")).toBe(false);
    expect(wrapper.text()).not.toContain("selected");
  });

  it("a quota-exceeded event closes the dialog and opens the paywall, reusing the existing modal", async () => {
    factionsData.value = [faction({ id: "f1" })];
    const wrapper = mountView();
    await toggleSelecting(wrapper);
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
