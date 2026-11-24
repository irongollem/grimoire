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
    imageProvider: ref("openai"),
    textCredits: (base: number) => base, imageCredits: (base: number) => base * 10,
  }),
}));
vi.mock("@/composables/billing/useQuota", () => ({ useQuota: () => ({ canCreate: { get value() { return state.canCreate; } } }) }));
vi.mock("@/composables/rules/useGameSystem", () => ({ useGameSystem: () => ({ offers: () => state.offersStatBlocks }) }));
vi.mock("@/composables/dungeon-features/useGenerateRollTable", () => ({
  useGenerateRollTable: () => ({ generateAndCreateRollTable: mocks.generateAndCreate }),
  ROLL_TABLE_GENERATOR_DICE: ["1d6", "1d8", "1d10", "1d12", "1d20"],
}));

const { useRollTableAskAdapter } = await import("./rollTableAskAdapter");
const { useRollTableQuote } = await import("@/composables/ai/quotes/rollTableQuote");

const proposal = (inputs: Record<string, unknown> = {}, concept = "Things in the smuggler's cellar"): AskProposal => ({
  proposalId: "p1", generator: "roll_table", concept, inputs,
});
const saved = (over: Record<string, unknown> = {}) => ({ id: "r1", name: "Cellar Finds", error: null, ...over });

describe("useRollTableAskAdapter", () => {
  beforeEach(() => {
    mocks.generateAndCreate.mockReset();
    Object.assign(state, { aiEnabled: true, canCreate: true, affordable: true, offersStatBlocks: true });
    mocks.generateAndCreate.mockResolvedValue(saved());
  });

  it("quotes the same price the page shows", () => {
    expect(useRollTableAskAdapter().quote(proposal()).total).toBe(useRollTableQuote()().total);
  });

  it("blocks with AI off, on a short balance, and on an empty or overlong concept, and runs nothing", async () => {
    const adapter = useRollTableAskAdapter();
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

  it("passes only understood constraints, and the page's default when one is not understood", async () => {
    await useRollTableAskAdapter().run(proposal({ die: 12, tone: "grim" }));
    expect(mocks.generateAndCreate).toHaveBeenLastCalledWith("Things in the smuggler's cellar", { die: "1d12" });
    // A d7 and a d100 are not dice the page offers: the page's own d8 applies.
    await useRollTableAskAdapter().run(proposal({ die: 7 }));
    expect(mocks.generateAndCreate).toHaveBeenLastCalledWith("Things in the smuggler's cellar", { die: "1d8" });
    await useRollTableAskAdapter().run(proposal({ die: 100 }));
    expect(mocks.generateAndCreate).toHaveBeenLastCalledWith("Things in the smuggler's cellar", { die: "1d8" });
  });

  it("returns a failed part instead of throwing when generation fails or the save throws", async () => {
    mocks.generateAndCreate.mockResolvedValueOnce({ id: null, name: null, error: "Provider down", });
    expect((await useRollTableAskAdapter().run(proposal())).parts[0]).toMatchObject({ ok: false, error: "Provider down" });
    mocks.generateAndCreate.mockRejectedValueOnce(new Error("save failed"));
    expect((await useRollTableAskAdapter().run(proposal())).parts[0]).toMatchObject({ ok: false, error: "save failed" });
  });

  it("needs no game system with stat blocks and no quota", async () => {
    state.offersStatBlocks = false;
    state.canCreate = false;
    expect(useRollTableAskAdapter().quote(proposal()).block).toBeNull();
    const result = await useRollTableAskAdapter().run(proposal());
    expect(result).toMatchObject({ route: "/roll-tables/r1" });
  });
});
