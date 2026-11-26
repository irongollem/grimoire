import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { canonEntry } from "@/test/canonEntry";
import type { CanonEntry } from "@/types/canon.types";

const read = <T>(data: T) => ({ data: ref(data), isLoading: ref(false), isError: ref(false) });
const entries = read<CanonEntry[]>([]);
const clues = read<unknown[]>([]);
const passages = read<unknown[]>([]);
const forces = read<{ steps: unknown[]; ticks: unknown[]; quests: unknown[] }>({ steps: [], ticks: [], quests: [] });
const party = read<unknown[]>([]);
const links = read<unknown[]>([]);
const facts = read<unknown[]>([]);

vi.mock("@/composables/canon/useCanonEntries", () => ({ useCanonEntries: () => entries }));
const mocks = vi.hoisted(() => ({ setFound: vi.fn(), tell: vi.fn(), takeBack: vi.fn(), tick: vi.fn(), reach: vi.fn(), leave: vi.fn(), toggle: vi.fn(), unpin: vi.fn(), move: vi.fn() }));
const npcs = read<unknown[]>([]);
const pins = read<unknown[]>([]);
const planLine = read<string | null>(null);
const arcs = read<unknown[]>([]);
const quests = read<unknown[]>([]);
const beatQuests = read<unknown[]>([]);
const locations = read<unknown[]>([]);
const sessions = read<unknown[]>([]);
const campaignState = { activeCampaign: { id: "c1", current_location_id: null as string | null } };
vi.mock("@/composables/canon/useCanonArcs", () => ({ useCanonArcs: () => arcs }));
vi.mock("@/composables/quests/useQuests", () => ({ useQuests: () => quests }));
vi.mock("@/composables/canon/useCampaignBeatQuests", () => ({ useCampaignBeatQuests: () => beatQuests }));
vi.mock("@/composables/locations/useLocations", () => ({ useAllLocations: () => locations }));
vi.mock("@/composables/sessions/useCampaignSessions", () => ({ useCampaignSessions: () => sessions }));
vi.mock("@/composables/canon/useCanonPassageEdits", () => ({ useTellPassage: () => ({ tell: mocks.tell, takeBack: mocks.takeBack }) }));
vi.mock("@/composables/canon/useCanonClues", () => ({ useCanonClues: () => clues, useSetClueFound: () => mocks.setFound }));
vi.mock("@/composables/canon/useCanonPassages", () => ({ useCanonPassages: () => passages }));
vi.mock("@/composables/canon/useCanonForces", () => ({ useCanonForceData: () => forces, useTickForce: () => ({ mutate: mocks.tick }), useReachForceStep: () => ({ mutate: mocks.reach }) }));
vi.mock("@/composables/npcs/useNpcs", () => ({ useNpcs: () => npcs }));
vi.mock("@/composables/canon/useWorldToday", () => ({ useWorldToday: () => ref({ year: 1000, month: 3, day: 5 }) }));
vi.mock("@/composables/canon/useTonightPlan", async (importActual) => ({
  ...(await importActual<typeof import("@/composables/canon/useTonightPlan")>()),
  useTonightPins: () => pins,
  useTonightPlanLine: () => planLine,
  useSavePlanLine: () => vi.fn(),
  useLeaveLooseEnd: () => ({ mutate: mocks.leave }),
  useTonightPinWrites: () => ({ toggle: mocks.toggle, unpin: mocks.unpin, move: mocks.move }),
}));
vi.mock("@/composables/party/useParty", () => ({ useParty: () => party }));
vi.mock("@/composables/connections/useConnections", () => ({ useCampaignLinks: () => links }));
vi.mock("@/composables/canon/useTableFacts", () => ({ useTableFacts: () => ({ facts }) }));
vi.mock("@/composables/canon/useClueWhere", () => ({ useClueWhere: () => ref(() => null) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => campaignState }));

import CanonTonightView from "./CanonTonightView.vue";

import { setActivePinia, createPinia } from "pinia";
import { useCanonUiStore } from "@/stores/ui/canon";
import { toast } from "@/lib/toast";

const stubs = {
  PageHeader: { template: "<div><slot name='actions' /><slot /></div>" },
  AppButton: { props: ["to", "label", "disabled"], template: "<button data-testid='btn' :disabled='disabled'>{{ label }}</button>" },
  SegmentedControl: {
    props: ["modelValue", "options"],
    emits: ["update:modelValue"],
    template: "<div data-testid='scope-control'><button v-for='o in options' :key='o.value' :data-testid=\"'scope-' + o.value\" @click=\"$emit('update:modelValue', o.value)\">{{ o.label }}</button></div>",
  },
  AppInput: { props: ["modelValue"], template: "<input data-testid='plan-input' :value='modelValue' />" },
  AutosaveStatus: { template: "<span />" },
  EmptyState: { props: ["title"], template: "<div data-testid='empty'>{{ title }}<slot name='action' /></div>" },
  ListSkeleton: { template: "<div data-testid='skeleton' />" },
  RouterLink: { props: ["to"], template: "<a><slot /></a>" },
};
const mountView = () => mount(CanonTonightView, { global: { stubs } });

describe("CanonTonightView", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useCanonUiStore().tonightScope = "all";
    Object.values(mocks).forEach((m) => m.mockReset());
    toast.toasts.value = [];
    campaignState.activeCampaign.current_location_id = null;
    clues.data.value = [];
    passages.data.value = [];
    arcs.data.value = [];
    entries.data.value = [];
    entries.isError.value = false;
    entries.isLoading.value = false;
    facts.data.value = [];
    npcs.data.value = [];
    pins.data.value = [];
    planLine.data.value = null;
    forces.data.value = { steps: [], ticks: [], quests: [] };
  });

  // Bug caught: an empty canon drawing five empty blocks (or a blank page) instead of saying nothing is waiting.
  it("says nothing is waiting, with a way back, when every block is empty", () => {
    const w = mountView();
    expect(w.find("[data-testid=empty]").exists()).toBe(true);
    expect(w.find("[data-testid=empty] button").exists()).toBe(true);
    expect(w.find("[data-testid=tonight-forces]").exists()).toBe(false);
  });

  // Bug caught: a failed read showing "nothing is waiting", which tells the DM to go in with an empty prep.
  it("says the read failed instead of an empty page", () => {
    entries.isError.value = true;
    const w = mountView();
    expect(w.find("[role=alert]").text()).toBe("Could not load Tonight.");
    expect(w.find("[data-testid=empty]").exists()).toBe(false);
  });

  // Bug caught: a block drawn for a force, or an empty block drawn beside it.
  it("shows only the blocks that have something, with a full clock flagged", () => {
    entries.data.value = [canonEntry({ id: "F1", part: "force", title: "The Tithe Court", clock_size: 2 })];
    forces.data.value = { steps: [], ticks: [{ force_id: "F1", delta: 2 }], quests: [] };
    const w = mountView();
    expect(w.find("[data-testid=tonight-forces]").text()).toContain("The Tithe Court");
    expect(w.find("[data-testid=tonight-forces]").text()).toContain("2 of 2 · The clock is full");
    expect(w.find("[data-testid=tonight-forces]").text()).toContain("No next step written");
    expect(w.find("[data-testid=tonight-lore]").exists()).toBe(false);
    expect(w.find("[data-testid=tonight-table]").exists()).toBe(false);
    forces.data.value = { steps: [], ticks: [], quests: [] };
  });

  const undoToast = () => toast.toasts.value.at(-1)?.action;
  const secret = canonEntry({ id: "S1", part: "secret", title: "A secret" });
  const clueRow = (id: string, over: Record<string, unknown> = {}) => ({ id, secret_id: "S1", title: `Clue ${id}`, sort_order: 0, created_at: "2026-01-01", found_at: null, location_id: null, npc_id: null, quest_beat_id: null, passage_id: null, ...over });

  // Bug caught: Found wired to the wrong clue, or to unfound (false), so the tick never lands.
  it("Found on a clue writes that clue as found through the shared writer", async () => {
    entries.data.value = [secret];
    clues.data.value = [clueRow("k1", { location_id: "loc" }), clueRow("k2", { location_id: "loc" })];
    const w = mountView();
    await w.findAll("[data-testid=tonight-found]")[1]!.trigger("click");
    expect(mocks.setFound).toHaveBeenCalledWith({ id: "k2" }, true);
  });

  const lore = canonEntry({ id: "L1", part: "lore", title: "Bell lore" });
  const passageRow = (id: string, over: Record<string, unknown> = {}) => ({ id, entry_id: "L1", title: `Passage ${id}`, sort_order: 1, created_at: "2026-01-01", told_at: null, location_id: "loc", npc_id: null, quest_beat_id: null, ...over });

  // Bug caught: Tell skipping the writer that stamps the open session, or telling a backstory passage to the whole party.
  it("Tell on a lore passage tells the whole party, and a backstory passage only its character", async () => {
    const backstory = canonEntry({ id: "B1", part: "backstory", party_member_id: "m1" });
    entries.data.value = [lore, backstory];
    passages.data.value = [passageRow("first", { sort_order: 0 }), passageRow("p2"), passageRow("first-b", { entry_id: "B1", sort_order: 0 }), passageRow("b2", { entry_id: "B1" })];
    const w = mountView();
    const tells = w.findAll("[data-testid=tonight-tell]");
    expect(tells).toHaveLength(2);
    await tells[0]!.trigger("click");
    expect(mocks.tell).toHaveBeenLastCalledWith({ id: "p2" }, undefined);
    await tells[1]!.trigger("click");
    expect(mocks.tell).toHaveBeenLastCalledWith({ id: "b2" }, ["m1"]);
  });

  // Bug caught: Tick ticking the campaign id as the force, or ticking a full clock past its size.
  it("Tick moves that force's clock forward by one, and is off when the clock is full", async () => {
    entries.data.value = [canonEntry({ id: "F1", part: "force", title: "Court", clock_size: 3 }), canonEntry({ id: "F2", part: "force", title: "Full", clock_size: 1 })];
    forces.data.value = { steps: [], ticks: [{ force_id: "F2", delta: 1 }], quests: [] };
    const w = mountView();
    const ticks = w.findAll("[data-testid=tonight-tick]");
    expect(ticks[1]!.attributes("disabled")).toBeDefined();
    await ticks[0]!.trigger("click");
    expect(mocks.tick).toHaveBeenCalledWith({ campaignId: "c1", forceId: "F1", delta: 1, note: "" });
    forces.data.value = { steps: [], ticks: [], quests: [] };
  });

  // Bug caught: the default scope showing everything, so a DM at the table reads the whole campaign's clues.
  it("narrows to where the party is by default, a room inside its town included", () => {
    useCanonUiStore().tonightScope = "party";
    campaignState.activeCampaign.current_location_id = "town";
    locations.data.value = [{ id: "town", parent_id: null }, { id: "room", parent_id: "town" }, { id: "far", parent_id: null }];
    entries.data.value = [secret];
    clues.data.value = [clueRow("inRoom", { location_id: "room" }), clueRow("inFar", { location_id: "far" })];
    const text = mountView().find("[data-testid=tonight-clues]").text();
    expect(text).toContain("Clue inRoom");
    expect(text).not.toContain("Clue inFar");
    locations.data.value = [];
  });

  // Bug caught: a scope that hides everything leaving a blank page with no word on why.
  it("says so under the control when the scope hides what the canon holds", () => {
    useCanonUiStore().tonightScope = "party";
    entries.data.value = [secret];
    clues.data.value = [clueRow("k1", { location_id: "far" })];
    const w = mountView();
    expect(w.find("[data-testid=scope-no-place]").text()).toContain("no place set");
    expect(w.find("[data-testid=scope-no-place] a").exists()).toBe(true);
    expect(w.find("[data-testid=empty]").exists()).toBe(false);
  });

  // Bug caught: the scope control a no-op: a click not writing the store scope (or not re-filtering the clues), so
  // the maintainer's three tabs "did nothing". Also a count per option, so an option says what it holds.
  it("clicking a scope option changes which clue rows render, and each option shows its count", async () => {
    useCanonUiStore().tonightScope = "all";
    campaignState.activeCampaign.current_location_id = "town";
    locations.data.value = [{ id: "town", parent_id: null }, { id: "far", parent_id: null }];
    entries.data.value = [secret];
    clues.data.value = [clueRow("here", { location_id: "town" }), clueRow("away", { location_id: "far" })];
    const w = mountView();
    expect(w.find("[data-testid=tonight-clues]").text()).toContain("Clue away");
    expect(w.get("[data-testid=scope-party]").text()).toBe("Where the party is · 1");
    expect(w.get("[data-testid=scope-all]").text()).toBe("Everything · 2");
    expect(w.get("[data-testid=scope-narrows]").text()).toBe("Narrows the lore and clues below.");
    await w.get("[data-testid=scope-party]").trigger("click");
    expect(useCanonUiStore().tonightScope).toBe("party");
    const text = w.find("[data-testid=tonight-clues]").text();
    expect(text).toContain("Clue here");
    expect(text).not.toContain("Clue away");
    locations.data.value = [];
  });

  // Bug caught: the scope control drawn on a Tonight with no lore or clue, where it can change nothing.
  it("hides the scope control when there is no lore or clue to narrow", () => {
    entries.data.value = [canonEntry({ id: "F1", part: "force", title: "Court" })];
    expect(mountView().find("[data-testid=tonight-scope]").exists()).toBe(false);
  });

  // Bug caught: Pin on a clue pinning another row, or a pinned row not appearing in Planned.
  it("pins a clue from its row and lists a pinned one in Planned", async () => {
    entries.data.value = [secret];
    clues.data.value = [clueRow("k1", { location_id: "loc" })];
    pins.data.value = [{ id: "pin1", clue_id: "k1", passage_id: null, step_id: null, entry_id: null, sort_order: 0, created_at: "2026-01-01" }];
    const w = mountView();
    expect(w.find("[data-testid=tonight-planned]").text()).toContain("Clue k1");
    await w.get("[data-testid=tonight-clues] [data-testid=tonight-pin]").trigger("click");
    expect(mocks.toggle).toHaveBeenCalledWith({ clue_id: "k1" });
    await w.get("[data-testid=planned-unpin]").trigger("click");
    expect(mocks.unpin).toHaveBeenCalledWith("pin1");
  });

  // Bug caught: an overdue step not flagged, or Reached marking nothing (or taking no Undo).
  it("flags an overdue step and Reached marks that step, with Undo", async () => {
    entries.data.value = [canonEntry({ id: "F1", part: "force", title: "Court" })];
    const step = { id: "st1", force_id: "F1", campaign_id: "c1", title: "Burn the mill", sort_order: 0, created_at: "2026-01-01", reached_at: null, due_year: 1000, due_month: 2, due_day: null };
    forces.data.value = { steps: [step], ticks: [], quests: [] };
    const w = mountView();
    expect(w.get("[data-testid=tonight-step-state]").text()).toBe("Overdue");
    await w.get("[data-testid=tonight-reached]").trigger("click");
    expect(mocks.reach).toHaveBeenLastCalledWith({ step, reached: true });
    undoToast()!.run();
    expect(mocks.reach).toHaveBeenLastCalledWith({ step, reached: false });
  });

  // Bug caught: Leave it writing no timestamp, or Undo not clearing it.
  it("Leave it leaves that entry and Undo takes it back", async () => {
    entries.data.value = [secret];
    const w = mountView();
    await w.get("[data-testid=loose-toggle]").trigger("click");
    await w.get("[data-testid=loose-leave]").trigger("click");
    expect(mocks.leave).toHaveBeenLastCalledWith({ id: "S1", arc: false, left: true });
    undoToast()!.run();
    expect(mocks.leave).toHaveBeenLastCalledWith({ id: "S1", arc: false, left: false });
  });

  // Bug caught: an arc's loose end had no Leave it, or left an entry by the arc's id.
  it("Leave it on an arc leaves the arc, and Undo takes it back", async () => {
    arcs.data.value = [{ id: "A1", name: "The drowned god", status: "running", loose_end_left_at: null }];
    const w = mountView();
    await w.get("[data-testid=loose-toggle]").trigger("click");
    await w.get("[data-testid=loose-leave]").trigger("click");
    expect(mocks.leave).toHaveBeenLastCalledWith({ id: "A1", arc: true, left: true });
    undoToast()!.run();
    expect(mocks.leave).toHaveBeenLastCalledWith({ id: "A1", arc: true, left: false });
  });

  // Bug caught: loose ends dropped from the page, or opened by default over the night's own work.
  it("shows the loose ends folded, and a secret with no clues is one", () => {
    entries.data.value = [secret];
    const w = mountView();
    expect(w.find("[data-testid=tonight-loose]").text()).toContain("Loose ends (1)");
    expect(w.find("[data-testid=loose-list]").attributes("style")).toContain("display: none");
  });

  // Bug caught: Undo on the Found toast writing found again (true) or to another clue, so the mis-tap cannot be taken back.
  it("Found offers Undo that sets that clue unfound, and the row moves under Done this session", async () => {
    entries.data.value = [secret];
    clues.data.value = [clueRow("k1", { location_id: "loc" }), clueRow("k2", { location_id: "loc" })];
    const w = mountView();
    await w.findAll("[data-testid=tonight-found]")[0]!.trigger("click");
    expect(w.findAll("[data-testid=tonight-found]")).toHaveLength(1);
    expect(w.find("[data-testid=done-list]").text()).toContain("Found: Clue k1");
    undoToast()!.run();
    expect(mocks.setFound).toHaveBeenLastCalledWith({ id: "k1" }, false);
    await w.vm.$nextTick();
    expect(w.find("[data-testid=tonight-done]").exists()).toBe(false);
  });

  // Bug caught: Undo on Tell not taking the passage back (or taking back another one), leaving it told to the party.
  it("Tell offers Undo that takes that passage back", async () => {
    entries.data.value = [lore];
    passages.data.value = [passageRow("first", { sort_order: 0 }), passageRow("p2")];
    const w = mountView();
    await w.get("[data-testid=tonight-tell]").trigger("click");
    undoToast()!.run();
    expect(mocks.takeBack).toHaveBeenCalledWith({ id: "p2" });
  });

  // Bug caught: Undo on Tick ticking forward again (delta 1) or not at all, so the clock cannot be set back from Tonight.
  it("Tick offers Undo that ticks that force back by one, from the fold too, and only once", async () => {
    entries.data.value = [canonEntry({ id: "F1", part: "force", title: "Court", clock_size: 3 })];
    forces.data.value = { steps: [], ticks: [], quests: [] };
    const w = mountView();
    await w.get("[data-testid=tonight-tick]").trigger("click");
    expect(mocks.tick).toHaveBeenLastCalledWith({ campaignId: "c1", forceId: "F1", delta: 1, note: "" });
    await w.get("[data-testid=done-undo]").trigger("click");
    expect(mocks.tick).toHaveBeenLastCalledWith({ campaignId: "c1", forceId: "F1", delta: -1, note: "" });
    undoToast()!.run(); // the toast after the fold already undid it: no second back-tick
    expect(mocks.tick).toHaveBeenCalledTimes(2);
  });

  // Bug caught: the last waiting row done flipping the page to "Nothing is waiting", taking the Undo with it.
  it("keeps the Done fold on screen when the last passage is told", async () => {
    entries.data.value = [lore];
    passages.data.value = [passageRow("first", { sort_order: 0 }), passageRow("p2")];
    const w = mountView();
    await w.get("[data-testid=tonight-tell]").trigger("click");
    passages.data.value = [passageRow("first", { sort_order: 0 }), passageRow("p2", { told_at: "2026-11-21T10:00:00Z" })]; // the refetch
    await w.vm.$nextTick();
    expect(w.find("[data-testid=empty]").exists()).toBe(false);
    expect(w.find("[data-testid=done-row]").text()).toContain("Told: Passage p2");
  });
});
