import { mount } from "@vue/test-utils";
import { reactive, ref, computed, defineComponent, h, type Ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NpcList from "./NpcList.vue";
import BulkSelectableCard from "@/components/common/BulkSelectableCard.vue";
import type { Npc } from "@/types/npc.types";

function npc(overrides: Partial<Npc> = {}): Npc {
  return {
    id: `n-${Math.random().toString(36).slice(2)}`,
    user_id: "u1",
    campaign_id: null,
    name: "Elowen Vance",
    race: "Half-Elf",
    alignment: "neutral good",
    age: "34",
    occupation: "Innkeeper",
    location_id: null,
    appearance: null,
    personality: null,
    backstory: null,
    notes: null,
    status: "alive",
    relationship: "friendly",
    portrait_url: null,
    disguise_name: null,
    disguise_portrait_url: null,
    is_revealed: true,
    tags: [],
    stat_block: null,
    linked_monster_id: null,
    scriptorium_doc_id: null,
    player_visible_to: [],
    player_visible_fields: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  } as Npc;
}

// ── Mocks ────────────────────────────────────────────────────────────────────
//
// `useMediaQuery` returns a plain `false` (not a ref) — the component's
// template only ever reads `isMobile` directly (never `.value`), so a bare
// boolean unwraps correctly and reliably forces the desktop grid branch,
// which is the one under test here (NpcGridCard/EntityMobileCard belong to
// other files and are stubbed away below).
vi.mock("@vueuse/core", () => ({ useMediaQuery: () => false }));

const npcsData = ref<Npc[]>([]);
vi.mock("@/composables/npcs/useNpcs", () => ({
  useNpcs: () => ({ data: npcsData, isLoading: ref(false) }),
}));

vi.mock("@/composables/npcs/useNpcPcNotes", () => ({
  useNpcPcNotesByPartyMember: () => ({ data: ref(new Set<string>()) }),
}));

vi.mock("@/composables/locations/useLocations", () => ({
  useAllLocations: () => ({ data: ref([]) }),
  useLocationTree: () => ({
    locationOptions: ref([]),
    getDescendantIds: (id: string) => new Set([id]),
  }),
}));

vi.mock("@/composables/billing/useQuota", () => ({
  useQuota: () => ({ canCreate: ref(true), quota: ref(null) }),
}));

const ui = { entityListLayout: "rows" };
vi.mock("@/stores/ui", () => ({ useUiStore: () => ui }));

vi.mock("@/stores/campaign", () => ({
  // Wrapped in `reactive()`, exactly like a real Pinia store: `storeToRefs`
  // (used by NpcList) needs `toRaw(store)` to still expose genuine refs for
  // `activeCampaign` — a bare object literal would silently drop it from the
  // destructure rather than error.
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
// this file assert the props NpcList hands it and drive its `copied` /
// `quota-exceeded` events (#885).
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
  useInfiniteScroll: (filtered: Ref<Npc[]>, pageSize = 48) => ({
    visibleItems: computed(() => filtered.value.slice(0, pageSize)),
    sentinelRef: ref(null),
    visibleCount: ref(Math.min(pageSize, filtered.value.length)),
  }),
}));
vi.mock("@/composables/useScrollRestore", () => ({
  useScrollRestore: () => ({ savedCount: undefined, linkCount: vi.fn() }),
}));

const stubs = {
  NpcGridCard: { template: '<div class="stub-card" />', props: ["npc", "locationName", "locked"] },
  EntityMobileCard: true,
  RouterLink: true,
  // Unrelated to bulk selection; it independently needs a real VueQueryPlugin
  // context (`usePlan`), which this test does not set up.
  PaywallModal: true,
};

interface NpcListExposed {
  selecting: boolean;
  toggleSelectMode: () => void;
}

const requiredProps = {
  search: "",
  statusFilter: "all",
  relFilter: "all",
  locationFilter: "",
  partyMemberFilter: "",
  sortBy: "name" as const,
};

function mountList() {
  return mount(NpcList, { props: requiredProps, global: { stubs } });
}

function exposed(wrapper: ReturnType<typeof mountList>): NpcListExposed {
  return wrapper.vm as unknown as NpcListExposed;
}

describe("NpcList — bulk selection (#885)", () => {
  beforeEach(() => {
    npcsData.value = [];
    mutateAsync.mockClear();
    mutateAsync.mockResolvedValue({ moved: 0 });
    toastSuccess.mockClear();
  });

  it("the Select toggle shows and hides the bulk scope bar", async () => {
    npcsData.value = [npc({ id: "n1" })];
    const wrapper = mountList();
    expect(wrapper.text()).not.toContain("selected");

    await exposed(wrapper).toggleSelectMode();
    expect(wrapper.text()).toContain("0 selected");

    await exposed(wrapper).toggleSelectMode();
    expect(wrapper.text()).not.toContain("selected");
  });

  it("select-all shown selects every filtered row, not only the windowed/painted subset", async () => {
    npcsData.value = Array.from({ length: 60 }, (_, i) => npc({ id: `npc-${i}`, name: `NPC ${i}` }));
    const wrapper = mountList();
    // Only 48 are painted (the windowed page), well under the 60 total.
    expect(wrapper.findAll(".stub-card")).toHaveLength(48);

    await exposed(wrapper).toggleSelectMode();
    const selectAllBtn = wrapper.findAll("button").find((b) => b.text() === "Select all shown");
    await selectAllBtn!.trigger("click");

    expect(wrapper.text()).toContain("60 selected");
  });

  it("clicking a card while selecting toggles it into the selection rather than navigating", async () => {
    npcsData.value = [npc({ id: "n1" }), npc({ id: "n2" }), npc({ id: "n3" })];
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

  it("every NPC row is selectable — no shared/library concept for NPCs", async () => {
    npcsData.value = [npc({ id: "n1" }), npc({ id: "n2" }), npc({ id: "n3" })];
    const wrapper = mountList();
    await exposed(wrapper).toggleSelectMode();

    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(3);
  });

  it("moving to the active campaign calls the mutation with the table, selected ids and campaign id", async () => {
    npcsData.value = [npc({ id: "n1" }), npc({ id: "n2" }), npc({ id: "n3" })];
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
    expect(call.table).toBe("npcs");
    expect(call.campaignId).toBe("camp-1");
    expect([...call.ids].sort()).toEqual(["n1", "n2"]);
  });

  it("prunes a stale id when the underlying list changes (refetch/filter) before the move (#875)", async () => {
    npcsData.value = [npc({ id: "n1" }), npc({ id: "n2" }), npc({ id: "n3" })];
    mutateAsync.mockResolvedValue({ moved: 1 });
    const wrapper = mountList();
    await exposed(wrapper).toggleSelectMode();

    const boxes = wrapper.findAll('input[type="checkbox"]');
    await boxes[0]!.trigger("click"); // n1
    await boxes[1]!.trigger("click"); // n2
    expect(wrapper.text()).toContain("2 selected");

    // A refetch (or a filter edit) drops n2 from the list entirely.
    npcsData.value = [npc({ id: "n1" }), npc({ id: "n3" })];
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain("1 selected");

    const moveBtn = wrapper.findAll("button").find((b) => b.text() === "Move to Neverwinter");
    await moveBtn!.trigger("click");
    await flushMicrotasks();

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    const call = mutateAsync.mock.calls[0]![0] as { table: string; ids: string[]; campaignId: string | null };
    expect(call.ids).toEqual(["n1"]);
  });

  it("making rows available in all campaigns calls the mutation with a null campaign id", async () => {
    npcsData.value = [npc({ id: "n1" })];
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
    expect(call.ids).toEqual(["n1"]);
  });
});

describe("NpcList — copy to campaign (#885)", () => {
  beforeEach(() => {
    npcsData.value = [];
    toastSuccess.mockClear();
  });

  it("opens the dialog with the pruned selection", async () => {
    npcsData.value = [npc({ id: "n1" }), npc({ id: "n2" })];
    const wrapper = mountList();
    await exposed(wrapper).toggleSelectMode();
    const selectAllBtn = wrapper.findAll("button").find((b) => b.text() === "Select all shown");
    await selectAllBtn!.trigger("click");

    const copyBtn = wrapper.findAll("button").find((b) => b.text() === "Copy to campaign…");
    await copyBtn!.trigger("click");

    const dialog = wrapper.findComponent({ name: "CopyToCampaignDialog" });
    expect(dialog.props("open")).toBe(true);
    expect(dialog.props("table")).toBe("npcs");
    expect([...(dialog.props("ids") as string[])].sort()).toEqual(["n1", "n2"]);
    expect(dialog.props("label")).toBe("NPC");
  });

  it("prunes a stale id at copy time exactly like move (#875)", async () => {
    npcsData.value = [npc({ id: "n1" }), npc({ id: "n2" }), npc({ id: "n3" })];
    const wrapper = mountList();
    await exposed(wrapper).toggleSelectMode();
    const boxes = wrapper.findAll('input[type="checkbox"]');
    await boxes[0]!.trigger("click"); // n1
    await boxes[1]!.trigger("click"); // n2

    npcsData.value = [npc({ id: "n1" }), npc({ id: "n3" })];
    await wrapper.vm.$nextTick();

    const copyBtn = wrapper.findAll("button").find((b) => b.text() === "Copy to campaign…");
    await copyBtn!.trigger("click");

    expect(wrapper.findComponent({ name: "CopyToCampaignDialog" }).props("ids")).toEqual(["n1"]);
  });

  it("a copied event toasts the count and destination, closes the dialog, and clears the selection", async () => {
    npcsData.value = [npc({ id: "n1" })];
    const wrapper = mountList();
    await exposed(wrapper).toggleSelectMode();
    const selectAllBtn = wrapper.findAll("button").find((b) => b.text() === "Select all shown");
    await selectAllBtn!.trigger("click");
    const copyBtn = wrapper.findAll("button").find((b) => b.text() === "Copy to campaign…");
    await copyBtn!.trigger("click");

    const dialog = wrapper.findComponent({ name: "CopyToCampaignDialog" });
    await dialog.vm.$emit("copied", { copied: 3, targetName: "Neverwinter" });

    expect(toastSuccess).toHaveBeenCalledWith("Copied 3 NPCs to Neverwinter.");
    expect(wrapper.findComponent({ name: "CopyToCampaignDialog" }).props("open")).toBe(false);
    expect(wrapper.text()).not.toContain("selected");
  });

  it("a quota-exceeded event closes the dialog and opens the paywall, reusing the existing modal", async () => {
    npcsData.value = [npc({ id: "n1" })];
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

describe("NpcList — checkbox corner placement (#885)", () => {
  it("puts the checkbox chip bottom-right on the desktop grid, clear of the reveal chip and relationship badge", async () => {
    npcsData.value = [npc({ id: "n1" })];
    const wrapper = mountList();
    await exposed(wrapper).toggleSelectMode();
    expect(wrapper.findComponent(BulkSelectableCard).props("corner")).toBe("bottom-right");
  });
});

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}
