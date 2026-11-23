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
vi.mock("@/composables/dungeon-features/useGenerateLootTable", () => ({
  useGenerateLootTable: () => ({ generateAndCreateLootTable: mocks.generateAndCreate }),
}));

const { useLootTableAskAdapter } = await import("./lootTableAskAdapter");
const { useLootTableQuote } = await import("@/composables/ai/quotes/lootTableQuote");

const proposal = (inputs: Record<string, unknown> = {}, concept = "The smugglers' vault"): AskProposal => ({
  proposalId: "p1", generator: "loot_table", concept, inputs,
});
const saved = (over: Record<string, unknown> = {}) => ({ id: "r1", name: "Vault Hoard", error: null, unresolved: 0, ...over });

describe("useLootTableAskAdapter", () => {
  beforeEach(() => {
    mocks.generateAndCreate.mockReset();
    Object.assign(state, { aiEnabled: true, canCreate: true, affordable: true, offersStatBlocks: true });
    mocks.generateAndCreate.mockResolvedValue(saved());
  });

  it("quotes the same price the page shows", () => {
    expect(useLootTableAskAdapter().quote(proposal()).total).toBe(useLootTableQuote()().total);
  });

  it("blocks with AI off, on a short balance, and on an empty or overlong concept, and runs nothing", async () => {
    const adapter = useLootTableAskAdapter();
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
    const adapter = useLootTableAskAdapter();
    expect(adapter.quote(proposal()).block?.reason).toBe("system");
    await adapter.run(proposal());
    expect(mocks.generateAndCreate).not.toHaveBeenCalled();
  });

  it("passes only understood constraints, and the page's default when one is not understood", async () => {
    await useLootTableAskAdapter().run(proposal({ cr_tier: "11-16", exclude_attunement: true }));
    // Attunement is never asked through Ask, whatever the model sends.
    expect(mocks.generateAndCreate).toHaveBeenLastCalledWith("The smugglers' vault", { crTier: "11-16", excludeAttunement: false });
    await useLootTableAskAdapter().run(proposal({ cr_tier: "mythic" }));
    expect(mocks.generateAndCreate).toHaveBeenLastCalledWith("The smugglers' vault", { crTier: "5-10", excludeAttunement: false });
  });

  it("returns a failed part instead of throwing when generation fails or the save throws", async () => {
    mocks.generateAndCreate.mockResolvedValueOnce({ id: null, name: null, error: "Provider down", unresolved: 0, });
    expect((await useLootTableAskAdapter().run(proposal())).parts[0]).toMatchObject({ ok: false, error: "Provider down" });
    mocks.generateAndCreate.mockRejectedValueOnce(new Error("save failed"));
    expect((await useLootTableAskAdapter().run(proposal())).parts[0]).toMatchObject({ ok: false, error: "save failed" });
  });

  it("says when items the catalogue lacks were left out of the table", async () => {
    mocks.generateAndCreate.mockResolvedValue(saved({ unresolved: 1 }));
    const result = await useLootTableAskAdapter().run(proposal());
    expect(result).toMatchObject({ record: { id: "r1" }, route: "/loot-tables/r1" });
    expect(result.parts[0]).toMatchObject({ label: "Loot table", ok: true });
    expect(result.parts[1]).toMatchObject({ label: "Items", ok: false });
    expect(result.parts[1].error).toContain("1 item was not in your Vault");
  });

  it("a table that lost nothing has the one part", async () => {
    expect((await useLootTableAskAdapter().run(proposal())).parts).toHaveLength(1);
  });
});
