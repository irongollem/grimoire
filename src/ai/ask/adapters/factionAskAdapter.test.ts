import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";

const mocks = vi.hoisted(() => ({ generateAndCreateFaction: vi.fn() }));
const state = vi.hoisted(() => ({
  aiEnabled: true, canCreate: true, affordable: true,
  npcs: undefined as { id: string; name: string; occupation: string | null }[] | undefined,
  places: undefined as { id: string; name: string }[] | undefined,
}));

vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ get isAiEnabled() { return state.aiEnabled; }, activeCampaign: { name: "Sugarwell" } }),
}));
vi.mock("@/composables/ai/useAiCredits", () => ({
  useAiCredits: () => ({ costOf: () => 1, affordable: () => state.affordable }),
}));
vi.mock("@/composables/ai/useCampaignProviders", () => ({
  useCampaignProviders: () => ({
    textIsByok: ref(false), imageIsByok: ref(false), imageProvider: ref("openai"),
    textCredits: (base: number) => base, imageCredits: (base: number) => base * 10,
  }),
}));
vi.mock("@/composables/billing/useQuota", () => ({ useQuota: () => ({ canCreate: { get value() { return state.canCreate; } } }) }));
vi.mock("@/composables/rules/useGameSystem", () => ({ useGameSystem: () => ({ offers: () => true }) }));
vi.mock("@/composables/npcs/useNpcs", () => ({ useNpcs: () => ({ data: { get value() { return state.npcs; } } }) }));
vi.mock("@/composables/locations/useLocations", () => ({
  useAllLocations: () => ({ data: { get value() { return state.places; } } }),
}));
vi.mock("@/composables/factions/useGenerateFaction", () => ({
  useGenerateFaction: () => ({ generateAndCreateFaction: mocks.generateAndCreateFaction }),
}));

const { useFactionAskAdapter } = await import("./factionAskAdapter");
const { useFactionQuote } = await import("@/composables/ai/quotes/factionQuote");

const proposal = (inputs: Record<string, unknown> = {}, concept = "A thieves' guild under the merchant quarter"): AskProposal => ({
  proposalId: "p1", generator: "faction", concept, inputs,
});
const saved = (over: Record<string, unknown> = {}) => ({
  id: "f1", name: "The Ravens", error: null, picture: "none", leader: "none", headquarters: "none", linkErrors: [], ...over,
});

describe("useFactionAskAdapter", () => {
  beforeEach(() => {
    mocks.generateAndCreateFaction.mockReset().mockResolvedValue(saved());
    Object.assign(state, {
      aiEnabled: true, canCreate: true, affordable: true,
      npcs: [{ id: "n1", name: "Mara", occupation: "Smith" }, { id: "n2", name: "Odo", occupation: null }, { id: "n3", name: "Odo", occupation: null }],
      places: [{ id: "l1", name: "Thornkeep" }],
    });
  });

  it("quotes the same price the page shows, with the emblem counted only when asked", () => {
    const adapter = useFactionAskAdapter();
    const price = useFactionQuote();
    expect(adapter.quote(proposal()).total).toBe(price({ image: false }).total);
    expect(adapter.quote(proposal({ image: true })).total).toBe(price({ image: true }).total);
  });

  it("blocks once per gate: AI off, the plan's faction limit, a short balance, a missing description", () => {
    state.aiEnabled = false;
    expect(useFactionAskAdapter().quote(proposal()).block?.reason).toBe("system");
    state.aiEnabled = true;
    state.canCreate = false;
    expect(useFactionAskAdapter().quote(proposal()).block?.reason).toBe("quota");
    state.canCreate = true;
    state.affordable = false;
    expect(useFactionAskAdapter().quote(proposal()).block?.reason).toBe("credits");
    state.affordable = true;
    expect(useFactionAskAdapter().quote(proposal({}, "")).block?.reason).toBe("missing");
  });

  it("waits for the NPCs and places before it quotes a named leader", () => {
    state.npcs = undefined;
    expect(useFactionAskAdapter().quote(proposal({ leader_name: "Mara" })).block).toMatchObject({ reason: "missing" });
  });

  it("links a leader and a headquarters only when the name is exactly one record, worded as the page words them", async () => {
    await useFactionAskAdapter().run(proposal({ leader_name: "mara", headquarters_name: "Thornkeep", faction_type: "guild", alignment: "chaotic neutral" }));
    expect(mocks.generateAndCreateFaction.mock.calls[0][1]).toEqual({
      faction_type: "Guild", alignment: "Chaotic Neutral",
      leader_name: "Mara (Smith)", headquarters_name: "Thornkeep",
      leaderNpcId: "n1", headquartersLocationId: "l1", generateImage: false,
    });
  });

  it("never links an ambiguous or unknown name, and still tells the generator the name as a constraint", async () => {
    await useFactionAskAdapter().run(proposal({ leader_name: "Odo", headquarters_name: "Nowhere Hall", system_prompt: "x" }));
    expect(mocks.generateAndCreateFaction.mock.calls[0][1]).toEqual({
      faction_type: undefined, alignment: undefined,
      leader_name: "Odo", headquarters_name: "Nowhere Hall",
      leaderNpcId: null, headquartersLocationId: null, generateImage: false,
    });
  });

  it("a blocked run spends nothing: the workflow is never called", async () => {
    state.canCreate = false;
    await useFactionAskAdapter().run(proposal());
    expect(mocks.generateAndCreateFaction).not.toHaveBeenCalled();
  });

  it("a leader that failed to link is its own failed part and the faction stays saved", async () => {
    mocks.generateAndCreateFaction.mockResolvedValue(saved({
      leader: "failed", headquarters: "saved", linkErrors: ["The leader could not be added: npc gone"],
    }));
    const result = await useFactionAskAdapter().run(proposal({ leader_name: "Mara", headquarters_name: "Thornkeep" }));
    expect(result).toMatchObject({ record: { type: "faction", id: "f1", name: "The Ravens" }, route: "/factions/f1" });
    expect(result.parts.map((p) => [p.label, p.ok])).toEqual([["Faction", true], ["Leader", false], ["Headquarters", true]]);
    expect(result.parts[1].error).toContain("npc gone");
  });

  it("a failed emblem leaves the faction saved, and offers no retry because no paint flow exists for emblems", async () => {
    mocks.generateAndCreateFaction.mockResolvedValue(saved({ picture: "failed" }));
    const result = await useFactionAskAdapter().run(proposal({ image: true }));
    expect(result.parts[1]).toMatchObject({ label: "Emblem", ok: false });
    expect(result.parts[1].retry).toBeUndefined();
  });

  it("returns a failed part instead of throwing when generation fails or the save throws, and names a quota race", async () => {
    mocks.generateAndCreateFaction.mockResolvedValueOnce({ ...saved(), id: null, name: null, error: "Provider down" });
    expect((await useFactionAskAdapter().run(proposal())).parts[0]).toMatchObject({ ok: false, error: "Provider down" });
    mocks.generateAndCreateFaction.mockRejectedValueOnce(new Error("save failed"));
    expect((await useFactionAskAdapter().run(proposal())).parts[0]).toMatchObject({ ok: false, error: "save failed" });
    mocks.generateAndCreateFaction.mockRejectedValueOnce({ message: "quota_exceeded" });
    expect((await useFactionAskAdapter().run(proposal())).parts[0].error).toContain("limit of factions");
  });
});
