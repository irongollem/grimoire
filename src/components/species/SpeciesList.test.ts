import { mount } from "@vue/test-utils";
import { reactive, ref, computed, defineComponent, h, type Ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SpeciesList from "./SpeciesList.vue";
import type { Species } from "@/types/species.types";

/** A valid-looking uuid (matches `isUuid`'s v4 pattern) for a custom row. */
function uuid(n: number): string {
  return `11111111-1111-4111-8111-${n.toString(16).padStart(12, "0")}`;
}

function customSpecies(n: number, overrides: Partial<Species> = {}): Species {
  return {
    id: uuid(n),
    user_id: "u1",
    campaign_id: null,
    name: `Species ${n}`,
    description: null,
    notes: null,
    size: "medium",
    avg_height: null,
    avg_weight: null,
    speed: null,
    ability_score_increases: null,
    traits: null,
    languages: [],
    tags: [],
    source: null,
    subraces: null,
    image_url: null,
    focal_point: null,
    is_shapeshifter: false,
    granted_spells: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  } as Species;
}

/** A shared/library row — identified by a non-uuid (slug) id, never a flag. */
function sharedSpecies(slug: string): Species {
  return customSpecies(0, { id: slug, name: slug });
}

// ── Mocks ────────────────────────────────────────────────────────────────────

const allSpecies = ref<Species[]>([]);
vi.mock("@/composables/rules/useSpecies", () => ({
  // No campaign blocklist under test here, so the gated `data` (used in
  // selectMode, the player picker) matches the ungated `all` (used in the DM
  // codex browse, where the bulk tool lives).
  useCampaignSpecies: () => ({ data: allSpecies, all: allSpecies, isLoading: ref(false) }),
}));

const ui = {
  speciesSearch: "",
  speciesFilterSize: "all",
  speciesFilterSource: "all",
  speciesHasActiveFilters: false,
};
vi.mock("@/stores/ui", () => ({ useUiStore: () => ui }));

vi.mock("@/stores/campaign", () => ({
  // Wrapped in `reactive()`, exactly like a real Pinia store: `storeToRefs`
  // needs `toRaw(store)` to still expose genuine refs for
  // `activeCampaignId`/`activeCampaign` (a plain value is silently dropped
  // from the destructure, not errored), while BulkScopeBar reads
  // `campaignStore.activeCampaignId` directly and needs the proxy's
  // read-time ref-unwrapping to hand back "camp-1" rather than the Ref
  // object itself (see MonsterList.test.ts; #598 caught this).
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
// this file assert the props SpeciesList hands it and drive its `copied`
// event (#598). species carries no enforce_quota trigger, so unlike
// MonsterList there is no quota-exceeded path to cover here.
vi.mock("@/components/common/CopyToCampaignDialog.vue", () => ({
  default: defineComponent({
    name: "CopyToCampaignDialog",
    props: ["open", "table", "ids", "sourceCampaignId", "label", "labelPlural"],
    emits: ["close", "copied"],
    setup(props) {
      return () => (props.open ? h("div", { class: "copy-dialog-stub" }) : null);
    },
  }),
}));

// Windowing over `filtered` without IntersectionObserver — mirrors the real
// composable's slicing so a >pageSize fixture still exercises "select all
// shown selects everything filtered, not only what's painted."
vi.mock("@/composables/useInfiniteScroll", () => ({
  useInfiniteScroll: (filtered: Ref<Species[]>, pageSize = 48) => ({
    visibleItems: computed(() => filtered.value.slice(0, pageSize)),
    sentinelRef: ref(null),
    visibleCount: ref(Math.min(pageSize, filtered.value.length)),
  }),
}));
vi.mock("@/composables/useScrollRestore", () => ({
  useScrollRestore: () => ({ savedCount: undefined, linkCount: vi.fn() }),
}));

const stubs = { RouterLink: true };

interface SpeciesListExposed {
  bulkSelecting: boolean;
  toggleBulkSelectMode: () => void;
}

function mountList(props: Record<string, unknown> = {}) {
  return mount(SpeciesList, { props, global: { stubs } });
}

function exposed(wrapper: ReturnType<typeof mountList>): SpeciesListExposed {
  return wrapper.vm as unknown as SpeciesListExposed;
}

describe("SpeciesList — bulk selection (#875)", () => {
  beforeEach(() => {
    allSpecies.value = [];
    mutateAsync.mockClear();
    mutateAsync.mockResolvedValue({ moved: 0 });
    toastSuccess.mockClear();
  });

  it("the Select toggle shows and hides the bulk scope bar", async () => {
    allSpecies.value = [customSpecies(1)];
    const wrapper = mountList();
    expect(wrapper.text()).not.toContain("selected");

    await exposed(wrapper).toggleBulkSelectMode();
    expect(wrapper.text()).toContain("0 selected");

    await exposed(wrapper).toggleBulkSelectMode();
    expect(wrapper.text()).not.toContain("selected");
  });

  it("select-all shown selects every filtered custom row, not only the windowed/painted subset", async () => {
    allSpecies.value = [
      ...Array.from({ length: 60 }, (_, i) => customSpecies(i + 1)),
      sharedSpecies("elf"),
      sharedSpecies("dwarf"),
    ];
    const wrapper = mountList();
    // 62 total rows, but only 48 are painted (the windowed page).
    expect(wrapper.findAll(".grid > *")).toHaveLength(48);

    await exposed(wrapper).toggleBulkSelectMode();
    const selectAllBtn = wrapper.findAll("button").find((b) => b.text() === "Select all shown");
    await selectAllBtn!.trigger("click");

    // All 60 custom rows are selected despite only 48 being rendered, and the
    // 2 shared/library rows (slug ids) are excluded.
    expect(wrapper.text()).toContain("60 selected");
  });

  it("clicking a card while selecting toggles it into the selection rather than navigating", async () => {
    allSpecies.value = [customSpecies(1), customSpecies(2)];
    const wrapper = mountList();
    await exposed(wrapper).toggleBulkSelectMode();
    expect(wrapper.text()).toContain("0 selected");

    // BulkSelectableCard's wrapping div intercepts the click with a capturing
    // listener, so a click anywhere on the card toggles the selection instead
    // of reaching the RouterLink underneath.
    await wrapper.find(".group.relative").trigger("click");

    expect(wrapper.text()).toContain("1 selected");
  });

  it("shared/library rows are never selectable", async () => {
    allSpecies.value = [customSpecies(1), customSpecies(2), sharedSpecies("elf"), sharedSpecies("dwarf")];
    const wrapper = mountList();
    await exposed(wrapper).toggleBulkSelectMode();

    // Only the two custom rows grow a selection checkbox.
    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(2);

    const selectAllBtn = wrapper.findAll("button").find((b) => b.text() === "Select all shown");
    await selectAllBtn!.trigger("click");
    expect(wrapper.text()).toContain("2 selected");
  });

  it("moving to the active campaign calls the mutation with the table, selected ids and campaign id", async () => {
    allSpecies.value = [customSpecies(1), customSpecies(2), customSpecies(3)];
    mutateAsync.mockResolvedValue({ moved: 2 });
    const wrapper = mountList();
    await exposed(wrapper).toggleBulkSelectMode();

    const boxes = wrapper.findAll('input[type="checkbox"]');
    await boxes[0]!.trigger("click");
    await boxes[1]!.trigger("click");
    expect(wrapper.text()).toContain("2 selected");

    const moveBtn = wrapper.findAll("button").find((b) => b.text() === "Move to Neverwinter");
    await moveBtn!.trigger("click");
    await flushMicrotasks();

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    const call = mutateAsync.mock.calls[0]![0] as { table: string; ids: string[]; campaignId: string | null };
    expect(call.table).toBe("species");
    expect(call.campaignId).toBe("camp-1");
    expect([...call.ids].sort()).toEqual([uuid(1), uuid(2)].sort());
  });

  it("prunes a stale id when the underlying list changes (refetch/filter) before the move (#875)", async () => {
    allSpecies.value = [customSpecies(1), customSpecies(2), customSpecies(3)];
    mutateAsync.mockResolvedValue({ moved: 1 });
    const wrapper = mountList();
    await exposed(wrapper).toggleBulkSelectMode();

    const boxes = wrapper.findAll('input[type="checkbox"]');
    await boxes[0]!.trigger("click"); // species 1
    await boxes[1]!.trigger("click"); // species 2
    expect(wrapper.text()).toContain("2 selected");

    // A refetch (or a size/source filter edit) drops species 2 from the list.
    allSpecies.value = [customSpecies(1), customSpecies(3)];
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain("1 selected");

    const moveBtn = wrapper.findAll("button").find((b) => b.text() === "Move to Neverwinter");
    await moveBtn!.trigger("click");
    await flushMicrotasks();

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    const call = mutateAsync.mock.calls[0]![0] as { table: string; ids: string[]; campaignId: string | null };
    expect(call.ids).toEqual([uuid(1)]);
  });

  it("making rows available in all campaigns calls the mutation with a null campaign id", async () => {
    allSpecies.value = [customSpecies(1)];
    mutateAsync.mockResolvedValue({ moved: 1 });
    const wrapper = mountList();
    await exposed(wrapper).toggleBulkSelectMode();

    const selectAllBtn = wrapper.findAll("button").find((b) => b.text() === "Select all shown");
    await selectAllBtn!.trigger("click");

    const allCampaignsBtn = wrapper.findAll("button").find((b) => b.text() === "Make available in all campaigns");
    await allCampaignsBtn!.trigger("click");
    await flushMicrotasks();

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    const call = mutateAsync.mock.calls[0]![0] as { table: string; ids: string[]; campaignId: string | null };
    expect(call.campaignId).toBeNull();
    expect(call.ids).toEqual([uuid(1)]);
  });

  it("selectMode (the player picker) keeps the bulk tool fully inert and its own single-select behaviour unchanged", async () => {
    allSpecies.value = [customSpecies(1), customSpecies(2)];
    const wrapper = mountList({ selectMode: true });

    // Bulk mode cannot be entered while selectMode is true.
    await exposed(wrapper).toggleBulkSelectMode();
    expect(exposed(wrapper).bulkSelecting).toBe(false);
    expect(wrapper.text()).not.toContain("selected");
    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(0);

    // The picker's own click-to-select still emits `select`, untouched.
    await wrapper.find(".group.relative button").trigger("click");
    expect(wrapper.emitted("select")).toBeTruthy();
    expect(wrapper.emitted("select")![0]).toEqual([allSpecies.value[0]]);
  });
});

describe("SpeciesList — copy to campaign (#598)", () => {
  beforeEach(() => {
    allSpecies.value = [];
    toastSuccess.mockClear();
  });

  it("opens the dialog with the pruned selection, the active campaign as the source scope, and the irregular plural", async () => {
    allSpecies.value = [customSpecies(1), customSpecies(2)];
    const wrapper = mountList();
    await exposed(wrapper).toggleBulkSelectMode();
    const selectAllBtn = wrapper.findAll("button").find((b) => b.text() === "Select all shown");
    await selectAllBtn!.trigger("click");

    const copyBtn = wrapper.findAll("button").find((b) => b.text() === "Copy to campaign…");
    await copyBtn!.trigger("click");

    const dialog = wrapper.findComponent({ name: "CopyToCampaignDialog" });
    expect(dialog.props("open")).toBe(true);
    expect(dialog.props("table")).toBe("species");
    expect([...(dialog.props("ids") as string[])].sort()).toEqual([uuid(1), uuid(2)].sort());
    // The source is the active campaign, not any row's own scope.
    expect(dialog.props("sourceCampaignId")).toBe("camp-1");
    expect(dialog.props("label")).toBe("species");
    expect(dialog.props("labelPlural")).toBe("species");
  });

  it("prunes a stale id at copy time exactly like move (#875)", async () => {
    allSpecies.value = [customSpecies(1), customSpecies(2), customSpecies(3)];
    const wrapper = mountList();
    await exposed(wrapper).toggleBulkSelectMode();
    const boxes = wrapper.findAll('input[type="checkbox"]');
    await boxes[0]!.trigger("click"); // species 1
    await boxes[1]!.trigger("click"); // species 2

    allSpecies.value = [customSpecies(1), customSpecies(3)];
    await wrapper.vm.$nextTick();

    const copyBtn = wrapper.findAll("button").find((b) => b.text() === "Copy to campaign…");
    await copyBtn!.trigger("click");

    expect(wrapper.findComponent({ name: "CopyToCampaignDialog" }).props("ids")).toEqual([uuid(1)]);
  });

  it("a copied event toasts the count and destination, closes the dialog, and clears the selection", async () => {
    allSpecies.value = [customSpecies(1)];
    const wrapper = mountList();
    await exposed(wrapper).toggleBulkSelectMode();
    const selectAllBtn = wrapper.findAll("button").find((b) => b.text() === "Select all shown");
    await selectAllBtn!.trigger("click");
    const copyBtn = wrapper.findAll("button").find((b) => b.text() === "Copy to campaign…");
    await copyBtn!.trigger("click");

    const dialog = wrapper.findComponent({ name: "CopyToCampaignDialog" });
    await dialog.vm.$emit("copied", { copied: 2, targetName: "Neverwinter" });

    expect(toastSuccess).toHaveBeenCalledWith("Copied 2 species to Neverwinter.");
    expect(wrapper.findComponent({ name: "CopyToCampaignDialog" }).props("open")).toBe(false);
    expect(wrapper.text()).not.toContain("selected");
  });
});

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}
