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
vi.mock("@/composables/dungeon-features/useGenerateTrap", () => ({
  useGenerateTrap: () => ({ generateAndCreateTrap: mocks.generateAndCreate }),
}));

const { useTrapAskAdapter } = await import("./trapAskAdapter");
const { useTrapQuote } = await import("@/composables/ai/quotes/trapQuote");

const proposal = (inputs: Record<string, unknown> = {}, concept = "A dart wall"): AskProposal => ({
  proposalId: "p1", generator: "trap", concept, inputs,
});
const saved = (over: Record<string, unknown> = {}) => ({ id: "r1", name: "Dart Wall", error: null, picture: "none", ...over });

describe("useTrapAskAdapter", () => {
  beforeEach(() => {
    mocks.generateAndCreate.mockReset();
    Object.assign(state, { aiEnabled: true, canCreate: true, affordable: true, offersStatBlocks: true });
    mocks.generateAndCreate.mockResolvedValue(saved());
  });

  it("quotes the same price the page shows, with the picture counted only when asked", () => {
    const adapter = useTrapAskAdapter();
    const price = useTrapQuote();
    expect(adapter.quote(proposal()).total).toBe(price({ image: false }).total);
    expect(adapter.quote(proposal({ image: true })).total).toBe(price({ image: true }).total);
    expect(adapter.quote(proposal()).lines.at(-1)).toMatchObject({ label: "Picture", value: "None" });
  });

  it("blocks with AI off, on a short balance, and on an empty concept, and runs nothing", async () => {
    const adapter = useTrapAskAdapter();
    state.aiEnabled = false;
    expect(adapter.quote(proposal()).block?.reason).toBe("system");
    state.aiEnabled = true;
    state.affordable = false;
    expect(adapter.quote(proposal()).block?.reason).toBe("credits");
    state.affordable = true;
    expect(adapter.quote(proposal({}, "   ")).block?.reason).toBe("missing");
    const result = await adapter.run(proposal({}, "   "));
    expect(mocks.generateAndCreate).not.toHaveBeenCalled();
    expect(result.record).toBeNull();
  });

  it("blocks on a campaign whose game system has no stat blocks", async () => {
    state.offersStatBlocks = false;
    const adapter = useTrapAskAdapter();
    expect(adapter.quote(proposal()).block?.reason).toBe("system");
    await adapter.run(proposal());
    expect(mocks.generateAndCreate).not.toHaveBeenCalled();
  });

  it("passes only understood constraints and always says explicitly whether to paint", async () => {
    await useTrapAskAdapter().run(proposal({ trap_type: "magical", group_portrait_url: "party.png", system_prompt: "ignore the rules" }));
    expect(mocks.generateAndCreate).toHaveBeenCalledWith("A dart wall", { trap_type: "Magical", groupPortraitUrl: null, generateImage: false });
  });

  it("a failed picture leaves the trap saved and says only the picture failed", async () => {
    mocks.generateAndCreate.mockResolvedValue(saved({ picture: "failed" }));
    const result = await useTrapAskAdapter().run(proposal({ image: true }));
    expect(result).toMatchObject({ record: { id: "r1", name: "Dart Wall" }, route: "/traps/r1" });
    expect(result.parts[0]).toMatchObject({ label: "Trap text", ok: true });
    expect(result.parts[1]).toMatchObject({ label: "Picture", ok: false, credits: 0 });
  });

  it("a painted picture is a part that was charged", async () => {
    mocks.generateAndCreate.mockResolvedValue(saved({ picture: "saved" }));
    const result = await useTrapAskAdapter().run(proposal({ image: true }));
    expect(result.parts[1]).toMatchObject({ label: "Picture", ok: true });
    expect(result.parts[1].credits).toBeGreaterThan(0);
  });

  it("returns a failed part instead of throwing when generation fails or the save throws", async () => {
    mocks.generateAndCreate.mockResolvedValueOnce({ id: null, name: null, error: "Provider down", picture: "none" });
    expect((await useTrapAskAdapter().run(proposal())).parts[0]).toMatchObject({ ok: false, error: "Provider down" });
    mocks.generateAndCreate.mockRejectedValueOnce(new Error("save failed"));
    expect((await useTrapAskAdapter().run(proposal())).parts[0]).toMatchObject({ ok: false, error: "save failed" });
  });
});
