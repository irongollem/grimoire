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
const mocks = vi.hoisted(() => ({ setFound: vi.fn(), tell: vi.fn(), tick: vi.fn() }));
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
vi.mock("@/composables/canon/useCanonPassageEdits", () => ({ useTellPassage: () => ({ tell: mocks.tell }) }));
vi.mock("@/composables/canon/useCanonClues", () => ({ useCanonClues: () => clues, useSetClueFound: () => mocks.setFound }));
vi.mock("@/composables/canon/useCanonPassages", () => ({ useCanonPassages: () => passages }));
vi.mock("@/composables/canon/useCanonForces", () => ({ useCanonForceData: () => forces, useTickForce: () => ({ mutate: mocks.tick }) }));
vi.mock("@/composables/party/useParty", () => ({ useParty: () => party }));
vi.mock("@/composables/connections/useConnections", () => ({ useCampaignLinks: () => links }));
vi.mock("@/composables/canon/useTableFacts", () => ({ useTableFacts: () => ({ facts }) }));
vi.mock("@/composables/canon/useClueWhere", () => ({ useClueWhere: () => ref(() => null) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => campaignState }));

import CanonTonightView from "./CanonTonightView.vue";

import { setActivePinia, createPinia } from "pinia";
import { useCanonUiStore } from "@/stores/ui/canon";

const stubs = {
  PageHeader: { template: "<div><slot name='actions' /><slot /></div>" },
  AppButton: { props: ["to", "label", "disabled"], template: "<button data-testid='btn' :disabled='disabled'>{{ label }}</button>" },
  SegmentedControl: { props: ["modelValue", "options"], template: "<div data-testid='scope-control'>{{ modelValue }}</div>" },
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
    campaignState.activeCampaign.current_location_id = null;
    clues.data.value = [];
    passages.data.value = [];
    arcs.data.value = [];
    entries.data.value = [];
    entries.isError.value = false;
    entries.isLoading.value = false;
    facts.data.value = [];
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

  // Bug caught: a read still loading treated as empty, flashing "nothing is waiting" on every visit.
  it("shows the skeleton while a read is loading", () => {
    entries.isLoading.value = true;
    const w = mountView();
    expect(w.find("[data-testid=skeleton]").exists()).toBe(true);
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
    expect(w.find("[data-testid=scope-empty]").text()).toContain("no place set");
    expect(w.find("[data-testid=empty]").exists()).toBe(false);
  });

  // Bug caught: loose ends dropped from the page, or opened by default over the night's own work.
  it("shows the loose ends folded, and a secret with no clues is one", () => {
    entries.data.value = [secret];
    const w = mountView();
    expect(w.find("[data-testid=tonight-loose]").text()).toContain("Loose ends (1)");
    expect(w.find("[data-testid=loose-list]").attributes("style")).toContain("display: none");
  });
});
