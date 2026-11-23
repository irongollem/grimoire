import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";

const mocks = vi.hoisted(() => ({ generateAndCreate: vi.fn() }));
const state = vi.hoisted(() => ({ aiEnabled: true, canCreate: true, affordable: true, offersStatBlocks: true }));

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
vi.mock("@/composables/rules/useGameSystem", () => ({ useGameSystem: () => ({ offers: () => state.offersStatBlocks }) }));
vi.mock("@/composables/encounters/useGenerateEncounter", () => ({
  useGenerateEncounter: () => ({ generateAndCreateEncounter: mocks.generateAndCreate }),
}));

const { useEncounterAskAdapter } = await import("./encounterAskAdapter");
const { useEncounterQuote } = await import("@/composables/ai/quotes/encounterQuote");

const proposal = (inputs: Record<string, unknown> = {}, concept = "Goblins on the forest road"): AskProposal => ({
  proposalId: "p1", generator: "encounter", concept, inputs,
});
const saved = (over: Record<string, unknown> = {}) => ({ id: "r1", name: "Road Ambush", error: null, unmatched: 0, ...over });

describe("useEncounterAskAdapter", () => {
  beforeEach(() => {
    mocks.generateAndCreate.mockReset();
    Object.assign(state, { aiEnabled: true, canCreate: true, affordable: true, offersStatBlocks: true });
    mocks.generateAndCreate.mockResolvedValue(saved());
  });

  it("quotes the same price the page shows", () => {
    expect(useEncounterAskAdapter().quote(proposal()).total).toBe(useEncounterQuote()().total);
  });

  it("blocks with AI off, on a short balance, and on an empty or overlong concept, and runs nothing", async () => {
    const adapter = useEncounterAskAdapter();
    state.aiEnabled = false;
    expect(adapter.quote(proposal()).block?.reason).toBe("system");
    state.aiEnabled = true;
    state.affordable = false;
    expect(adapter.quote(proposal()).block?.reason).toBe("credits");
    state.affordable = true;
    expect(adapter.quote(proposal({}, "   ")).block?.reason).toBe("missing");
    expect(adapter.quote(proposal({}, "x".repeat(501))).block?.reason).toBe("missing");
    const result = await adapter.run(proposal({}, "   "));
    expect(mocks.generateAndCreate).not.toHaveBeenCalled();
    expect(result.record).toBeNull();
  });

  it("blocks on a campaign whose game system has no stat blocks", async () => {
    state.offersStatBlocks = false;
    const adapter = useEncounterAskAdapter();
    expect(adapter.quote(proposal()).block?.reason).toBe("system");
    await adapter.run(proposal());
    expect(mocks.generateAndCreate).not.toHaveBeenCalled();
  });

  it("blocks on the encounters quota and says the plan limit when the save loses the race", async () => {
    state.canCreate = false;
    expect(useEncounterAskAdapter().quote(proposal()).block?.reason).toBe("quota");
    state.canCreate = true;
    mocks.generateAndCreate.mockRejectedValueOnce(new Error("quota_exceeded"));
    expect((await useEncounterAskAdapter().run(proposal())).parts[0].error).toContain("limit of encounters");
  });

  it("passes only understood constraints, and the page's default when one is not understood", async () => {
    await useEncounterAskAdapter().run(proposal({ difficulty: "Deadly", party_level: 9 }));
    expect(mocks.generateAndCreate).toHaveBeenLastCalledWith("Goblins on the forest road", { difficulty: "deadly" });
    await useEncounterAskAdapter().run(proposal({ difficulty: "impossible" }));
    expect(mocks.generateAndCreate).toHaveBeenLastCalledWith("Goblins on the forest road", { difficulty: "auto" });
  });

  it("returns a failed part instead of throwing when generation fails or the save throws", async () => {
    mocks.generateAndCreate.mockResolvedValueOnce({ id: null, name: null, error: "Provider down", unmatched: 0, });
    expect((await useEncounterAskAdapter().run(proposal())).parts[0]).toMatchObject({ ok: false, error: "Provider down" });
    mocks.generateAndCreate.mockRejectedValueOnce(new Error("save failed"));
    expect((await useEncounterAskAdapter().run(proposal())).parts[0]).toMatchObject({ ok: false, error: "save failed" });
  });

  it("opens the editor, like the page, and says which creatures the Bestiary lacked", async () => {
    mocks.generateAndCreate.mockResolvedValue(saved({ unmatched: 2 }));
    const result = await useEncounterAskAdapter().run(proposal());
    expect(result).toMatchObject({ record: { type: "encounter", id: "r1" }, route: "/encounters/r1?edit=true" });
    expect(result.parts[0]).toMatchObject({ label: "Encounter", ok: true });
    expect(result.parts[1]).toMatchObject({ label: "Creatures", ok: false });
    expect(result.parts[1].error).toContain("2 creatures are not in your Bestiary");
  });

  it("a clean run has the one part", async () => {
    expect((await useEncounterAskAdapter().run(proposal())).parts).toHaveLength(1);
  });
});
