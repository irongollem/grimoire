import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref } from "vue";
import type { RevealableMonster } from "@/composables/monsters/useMonsterVisibility";

// #1259: a discovered monster's `visible_to === null` is the whole party, now and later. A list of today's ids
// would leave out a character who joins after the reveal, so every write that reaches the whole party stores `null`.

const session = vi.hoisted(() => ({
  party: [{ id: "pc-1" }, { id: "pc-2" }] as { id: string }[],
  discoveries: [] as { id: string; monster_id: string | null; library_monster_id: string | null; visible_to: string[] | null }[],
  toggle: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/composables/party/useActiveParty", async () => {
  const { computed } = await import("vue");
  return { useActiveParty: () => ({ data: computed(() => session.party) }) };
});
vi.mock("@/composables/encounters/useDiscoveredMonsters", async () => {
  const { computed } = await import("vue");
  return {
    useCampaignDiscoveries: () => ({ data: computed(() => session.discoveries) }),
    useToggleMonsterDiscovery: () => ({ mutate: session.toggle }),
    useUpdateDiscoveryVisibility: () => ({ mutate: session.update }),
    useUpdateDiscoveryStats: () => ({ mutate: vi.fn() }),
  };
});

const { useMonsterVisibility } = await import("@/composables/monsters/useMonsterVisibility");

const monster = { id: "m-1", is_shared: false } as RevealableMonster;

beforeEach(() => {
  session.party = [{ id: "pc-1" }, { id: "pc-2" }];
  session.discoveries = [];
  session.toggle.mockReset();
  session.update.mockReset();
});

describe("useMonsterVisibility", () => {
  it("discovers for the whole party as null, so a later joiner sees it too", () => {
    useMonsterVisibility(ref(monster)).setWholeParty();
    expect(session.toggle).toHaveBeenCalledWith(expect.objectContaining({ visibleTo: null }));
  });

  it("widens an existing discovery to the whole party as null", () => {
    session.discoveries = [{ id: "d-1", monster_id: "m-1", library_monster_id: null, visible_to: ["pc-1"] }];
    useMonsterVisibility(ref(monster)).setWholeParty();
    expect(session.update).toHaveBeenCalledWith({ id: "d-1", visibleTo: null });
  });

  it("stores null when ticking the last character at the table", () => {
    session.discoveries = [{ id: "d-1", monster_id: "m-1", library_monster_id: null, visible_to: ["pc-1"] }];
    useMonsterVisibility(ref(monster)).toggleMember("pc-2");
    expect(session.update).toHaveBeenCalledWith({ id: "d-1", visibleTo: null });
  });

  it("keeps an explicit list while someone at the table is left out", () => {
    session.party = [{ id: "pc-1" }, { id: "pc-2" }, { id: "pc-3" }];
    session.discoveries = [{ id: "d-1", monster_id: "m-1", library_monster_id: null, visible_to: ["pc-1"] }];
    useMonsterVisibility(ref(monster)).toggleMember("pc-2");
    expect(session.update).toHaveBeenCalledWith({ id: "d-1", visibleTo: ["pc-1", "pc-2"] });
  });

  it("names everyone but the one unticked when narrowing from the whole party", () => {
    session.discoveries = [{ id: "d-1", monster_id: "m-1", library_monster_id: null, visible_to: null }];
    useMonsterVisibility(ref(monster)).toggleMember("pc-1");
    expect(session.update).toHaveBeenCalledWith({ id: "d-1", visibleTo: ["pc-2"] });
  });
});
