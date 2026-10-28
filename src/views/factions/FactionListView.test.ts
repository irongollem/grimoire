import { mount } from "@vue/test-utils";
import { useVirtualGridViewport } from "@/components/common/list/virtualGridTestViewport";
import { reactive, ref, computed, defineComponent, h } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FactionListView from "./FactionListView.vue";
import BulkSelectableCard from "@/components/common/list/BulkSelectableCard.vue";
import type { Faction } from "@/types/faction.types";

// The Open Book pair in the bulk bar reads the book through TanStack Query; these tests mount without a client.
vi.mock("@/composables/openBook/useBulkOpenBook", () => ({
  useBulkOpenBook: () => ({ available: ref(false), busy: ref(false), add: vi.fn(), remove: vi.fn() }),
}));


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
const populate = vi.hoisted(() => vi.fn());
const updateFaction = vi.hoisted(() => vi.fn());
const settingFlag = vi.hoisted(() => ({ has: false }));
const quotaFlag = vi.hoisted(() => ({ isQuota: (_e: unknown): boolean => false }));
vi.mock("@/composables/factions/useFactions", () => ({
  useAllFactions: () => ({ data: factionsData, isLoading: ref(false) }),
  usePopulateFactions: () => ({ isPending: ref(false), mutateAsync: populate }),
  useUpdateFaction: () => ({ mutate: updateFaction }),
}));

vi.mock("@/settings/index", () => ({ getSetting: () => (settingFlag.has ? { id: "faerun" } : null) }));

const ui = {
  factionsSearch: "",
  factionsFilterType: "",
  factionsHasActiveFilters: false,
  resetFactionsFilters: vi.fn(),
};
vi.mock("@/stores/ui/factions", () => ({ useFactionsUiStore: () => ui }));
vi.mock("@/stores/ui/generators", () => ({ useGeneratorUiStore: () => ({ factionGeneratorOpen: false }) }));

const aiFlag = vi.hoisted(() => ({ on: false }));
vi.mock("@/stores/campaign", () => ({
  // Wrapped in `reactive()`, matching the real Pinia-store shape so
  // `campaign.activeCampaign` reads back the object rather than a Ref.
  useCampaignStore: () => reactive({
    activeCampaignId: ref("camp-1"),
    activeCampaign: ref({ id: "camp-1", name: "Neverwinter" }),
    isAiEnabled: computed(() => aiFlag.on),
  }),
}));

vi.mock("@/composables/billing/useCreateGate", () => ({
  useCreateGate: () => ({
    canCreate: ref(true),
    showPaywall: ref(false),
    handleNew: vi.fn(),
    gateQuotaError: (e: unknown) => quotaFlag.isQuota(e),
  }),
}));

const mutateAsync = vi.fn().mockResolvedValue({ moved: 0 });
vi.mock("@/composables/campaign/useBulkCampaignScope", () => ({
  useBulkCampaignScope: () => ({ mutateAsync, isPending: ref(false) }),
  // world_links has a NOT NULL campaign_id (#1084) — the real function
  // returns false for "factions" for exactly this reason; pinned here rather
  // than re-derived so this file breaks if FactionListView stops calling it.
  bulkScopeAllowsGeneral: (table: string) => table !== "factions",
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
  // A client list restores scroll position only; it reads nothing back.
  useScrollRestore: () => ({}),
}));

// jsdom has no layout; see the helper for what this stands in for.
useVirtualGridViewport();

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

  it("select-all shown selects every filtered row, not only the mounted subset", async () => {
    factionsData.value = Array.from({ length: 200 }, (_, i) => faction({ id: `faction-${i}`, name: `Faction ${i}` }));
    const wrapper = mountView();
    await flushMicrotasks(); // VirtualGrid finds its scroller on mount, rows follow
    // Only the rows near the viewport are mounted, well under the 200 total.
    // (60 was once enough; @tanstack/vue-virtual 3.13.46 fills the test
    // viewport plus its overscan with all 60, so the list must be longer
    // than a screenful for "only a subset mounts" to mean anything.)
    const mounted = wrapper.findAll(".stub-card").length;
    expect(mounted).toBeGreaterThan(0);
    expect(mounted).toBeLessThan(200);

    await toggleSelecting(wrapper);
    const selectAllBtn = wrapper.findAll("button").find((b) => b.text() === "Select all shown");
    await selectAllBtn!.trigger("click");

    expect(wrapper.text()).toContain("200 selected");
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

  it("drops a selected id when the underlying list changes (refetch/filter) (#875)", async () => {
    factionsData.value = [faction({ id: "f1" }), faction({ id: "f2" }), faction({ id: "f3" })];
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
  });

  // world_links carries a NOT NULL campaign_id, so a general move can
  // never fully succeed for a faction — bulkScopeAllowsGeneral("factions") is
  // false, and FactionListView wires that straight to BulkScopeBar's
  // allowGeneralScope (#885). "Make available in all campaigns" is therefore
  // never offered here at all, rather than being offered and left to fail
  // against the database.
  it("never offers 'Make available in all campaigns' — a faction's links can't follow it there", async () => {
    factionsData.value = [faction({ id: "f1" })];
    const wrapper = mountView();
    await toggleSelecting(wrapper);

    const selectAllBtn = wrapper.findAll("button").find((b) => b.text() === "Select all shown");
    await selectAllBtn!.trigger("click");

    expect(wrapper.findAll("button").some((b) => b.text() === "Make available in all campaigns")).toBe(false);
    // Move to the active campaign is unaffected — only the general scope is suppressed.
    expect(wrapper.findAll("button").some((b) => b.text() === "Move to Neverwinter")).toBe(true);
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

  it("a copied event closes the dialog and ends selection", async () => {
    factionsData.value = [faction({ id: "f1" })];
    const wrapper = mountView();
    await toggleSelecting(wrapper);
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

describe("FactionListView — AI off", () => {
  const generateButton = (wrapper: ReturnType<typeof mountView>) =>
    wrapper.findAll("button").find((b) => b.text().includes("Generate"));

  it("hides the Generate button when the campaign's AI is off, shows it when on", () => {
    aiFlag.on = false;
    expect(generateButton(mountView())).toBeUndefined();
    aiFlag.on = true;
    expect(generateButton(mountView())).toBeDefined();
    aiFlag.on = false;
  });
});

describe("FactionListView — finding factions and populating a setting", () => {
  beforeEach(() => {
    ui.factionsSearch = "";
    ui.factionsFilterType = "";
    populate.mockReset();
    updateFaction.mockReset();
    settingFlag.has = false;
    quotaFlag.isQuota = () => false;
    factionsData.value = [
      faction({ id: "f1", name: "The Iron Circle", faction_type: "Guild", tags: ["smiths"] }),
      faction({ id: "f2", name: "Ravens of the Vale", faction_type: "Cult", tags: ["spies"] }),
      faction({ id: "f3", name: "House Thane", faction_type: "House", tags: [] }),
    ];
  });
  afterEach(() => {
    ui.factionsSearch = "";
    ui.factionsFilterType = "";
  });
  const shown = async () => {
    const wrapper = mountView();
    await flushMicrotasks();
    return wrapper.findAll(".stub-card").length;
  };
  const populateButton = (w: ReturnType<typeof mountView>) => w.findAllComponents({ name: "AppButton" }).find((b) => b.props("label")?.toString().match(/Populate|Added|Already|Error|Populating/));

  it("with no search or type chosen, every faction is listed", async () => {
    expect(await shown()).toBe(3);
  });

  it("the type filter keeps only that type", async () => {
    ui.factionsFilterType = "Cult";
    expect(await shown()).toBe(1);
  });

  it.each([
    ["part of a name, ignoring case", "RAVENS", 1],
    ["a tag", "smith", 1],
    ["surrounding spaces", "  thane  ", 1],
    ["nothing that exists", "dragon", 0],
  ])("a search for %s", async (_name, query, expected) => {
    ui.factionsSearch = query;
    expect(await shown()).toBe(expected);
  });

  it("the search and the type filter narrow together", async () => {
    // "the" alone matches two factions; the type then picks one of them.
    ui.factionsSearch = "the";
    ui.factionsFilterType = "Cult";
    expect(await shown()).toBe(1);
  });

  it("offers Populate Setting only when the campaign's setting has factions to add", () => {
    expect(populateButton(mountView())).toBeUndefined();
    settingFlag.has = true;
    expect(populateButton(mountView())?.props("label")).toBe("Populate Setting");
  });

  it.each([
    [2, "Added 2 factions"],
    [1, "Added 1 faction"],
    [0, "Already up to date"],
  ])("populating that adds %i says %j", async (count, label) => {
    settingFlag.has = true;
    populate.mockResolvedValue(count);
    const wrapper = mountView();
    await populateButton(wrapper)!.trigger("click");
    await flushMicrotasks();
    expect(populateButton(wrapper)?.props("label")).toBe(label);
  });

  it("a failed populate shows its reason, or 'Unknown error' for a rejection that is not an Error, and the next try clears it", async () => {
    settingFlag.has = true;
    populate.mockRejectedValueOnce(new Error("Setting unavailable")).mockRejectedValueOnce("nope").mockResolvedValue(0);
    const wrapper = mountView();
    await populateButton(wrapper)!.trigger("click");
    await flushMicrotasks();
    expect(populateButton(wrapper)?.props("label")).toBe("Error: Setting unavailable");
    await populateButton(wrapper)!.trigger("click");
    await flushMicrotasks();
    expect(populateButton(wrapper)?.props("label")).toBe("Error: Unknown error");
    await populateButton(wrapper)!.trigger("click");
    await flushMicrotasks();
    expect(populateButton(wrapper)?.props("label")).toBe("Already up to date");
  });

  it("a populate stopped by the free-tier cap shows the paywall's route, not a raw error", async () => {
    settingFlag.has = true;
    quotaFlag.isQuota = () => true;
    populate.mockRejectedValue({ message: "quota_exceeded" });
    const wrapper = mountView();
    await populateButton(wrapper)!.trigger("click");
    await flushMicrotasks();
    expect(populateButton(wrapper)?.props("label")).toBe("Populate Setting");
  });

  it("revealing a faction to some players writes exactly that audience on that faction", async () => {
    factionsData.value = [faction({ id: "f1" })];
    const wrapper = mountView();
    await flushMicrotasks();
    wrapper.findComponent({ name: "AudienceRevealControl" }).vm.$emit("change", ["pc-1", "pc-2"]);
    expect(updateFaction).toHaveBeenCalledWith({ id: "f1", update: { player_visible_to: ["pc-1", "pc-2"] } });
  });
});
