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
vi.mock("@/composables/canon/useCanonClues", () => ({ useCanonClues: () => clues }));
vi.mock("@/composables/canon/useCanonPassages", () => ({ useCanonPassages: () => passages }));
vi.mock("@/composables/canon/useCanonForces", () => ({ useCanonForceData: () => forces }));
vi.mock("@/composables/party/useParty", () => ({ useParty: () => party }));
vi.mock("@/composables/connections/useConnections", () => ({ useCampaignLinks: () => links }));
vi.mock("@/composables/canon/useTableFacts", () => ({ useTableFacts: () => ({ facts }) }));
vi.mock("@/composables/canon/useClueWhere", () => ({ useClueWhere: () => ref(() => null) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaign: { id: "c1" } }) }));

import CanonTonightView from "./CanonTonightView.vue";

const stubs = {
  PageHeader: { template: "<div><slot name='actions' /><slot /></div>" },
  AppButton: { props: ["to", "label"], template: "<a data-testid='btn' :href='to'>{{ label }}</a>" },
  EmptyState: { props: ["title"], template: "<div data-testid='empty'>{{ title }}<slot name='action' /></div>" },
  ListSkeleton: { template: "<div data-testid='skeleton' />" },
  RouterLink: { props: ["to"], template: "<a><slot /></a>" },
};
const mountView = () => mount(CanonTonightView, { global: { stubs } });

describe("CanonTonightView", () => {
  beforeEach(() => {
    entries.data.value = [];
    entries.isError.value = false;
    entries.isLoading.value = false;
    facts.data.value = [];
  });

  // Bug caught: an empty canon drawing five empty blocks (or a blank page) instead of saying nothing is waiting.
  it("says nothing is waiting, with a way back, when every block is empty", () => {
    const w = mountView();
    expect(w.find("[data-testid=empty]").exists()).toBe(true);
    expect(w.find("[data-testid=empty] a").attributes("href")).toBe("/canon");
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
});
