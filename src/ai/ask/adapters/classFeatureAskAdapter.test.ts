import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";

const mocks = vi.hoisted(() => ({ gen: vi.fn() }));
const state = vi.hoisted(() => ({ aiEnabled: true, canCreate: true, affordable: true, offers: true, lookups: undefined as unknown }));

vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    get isAiEnabled() { return state.aiEnabled; },
    activeCampaign: { name: "Sugarwell" },
  }),
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
vi.mock("@/composables/rules/useGameSystem", () => ({ useGameSystem: () => ({ offers: () => state.offers }) }));
vi.mock("@/composables/rules/useGenerateClassFeature", () => ({
  useGenerateClassFeature: () => ({ generateAndCreateClassFeature: mocks.gen }),
}));

const { useClassFeatureAskAdapter } = await import("./classFeatureAskAdapter");
const { useClassFeatureQuote } = await import("@/composables/ai/quotes/classFeatureQuote");

const proposal = (inputs: Record<string, unknown> = {}, concept = "A test concept"): AskProposal => ({
  proposalId: "p1", generator: "class_feature", concept, inputs,
});
const saved = (over: Record<string, unknown> = {}) => ({ id: "f1", name: "Cover of Leaves", error: null, ...over });

describe("useClassFeatureAskAdapter", () => {
  beforeEach(() => {
    mocks.gen.mockReset();
    Object.assign(state, { aiEnabled: true, canCreate: true, affordable: true, offers: true });
    mocks.gen.mockResolvedValue(saved());
  });

  it("quotes the same price the page shows", () => {
    const adapter = useClassFeatureAskAdapter();
    const pageQuote = useClassFeatureQuote();
    expect(adapter.quote(proposal()).total).toBe(pageQuote().total);
  });

  it("blocks once per gate: AI off, short balance, and an empty description", () => {
    const adapter = useClassFeatureAskAdapter();
    state.aiEnabled = false;
    expect(adapter.quote(proposal()).block?.reason).toBe("system");
    state.aiEnabled = true;
    state.affordable = false;
    expect(adapter.quote(proposal()).block?.reason).toBe("credits");
    state.affordable = true;
    expect(adapter.quote(proposal({}, "  ")).block?.reason).toBe("missing");
  });

  it("a campaign without 5e rules is blocked, not run", async () => {
    state.offers = false;
    const adapter = useClassFeatureAskAdapter();
    expect(adapter.quote(proposal()).block?.reason).toBe("system");
    const result = await adapter.run(proposal());
    expect(mocks.gen).not.toHaveBeenCalled();
    expect(result.record).toBeNull();
  });

  it("passes only understood constraints and drops what the page's own picker does not offer", async () => {
    await useClassFeatureAskAdapter().run(proposal({ activation: "bonus_action", system_prompt: "x" }));
    expect(mocks.gen).toHaveBeenCalledWith("A test concept", { activation: "bonus_action", forWhom: undefined });
    mocks.gen.mockClear();
    await useClassFeatureAskAdapter().run(proposal({ activation: "whenever" }));
    expect(mocks.gen).toHaveBeenCalledWith("A test concept", { activation: undefined, forWhom: undefined });
  });

  // Bug caught: the card's "For which class or species" box was dropped before the workflow, so the ability came back for nobody in particular.
  it("passes who it is for to the workflow and names it on the quote", async () => {
    const adapter = useClassFeatureAskAdapter();
    expect(adapter.quote(proposal({ for_whom: "Ranger" })).lines).toContainEqual(expect.objectContaining({ label: "For", value: "Ranger" }));
    await adapter.run(proposal({ for_whom: "Ranger" }));
    expect(mocks.gen).toHaveBeenCalledWith("A test concept", { activation: undefined, forWhom: "Ranger" });
  });

  it("a successful run names the record and opens it where the page does", async () => {
    const result = await useClassFeatureAskAdapter().run(proposal());
    expect(result).toMatchObject({ record: { type: "other" }, route: "/features/f1" });
    expect(result.parts[0]).toMatchObject({ label: "Ability text", ok: true });
  });

  it("returns a failed part instead of throwing when generation fails or the save throws", async () => {
    mocks.gen.mockResolvedValueOnce({ id: null, name: null, error: "Provider down" });
    expect((await useClassFeatureAskAdapter().run(proposal())).parts[0]).toMatchObject({ ok: false, error: "Provider down" });
    mocks.gen.mockRejectedValueOnce(new Error("save failed"));
    expect((await useClassFeatureAskAdapter().run(proposal())).parts[0]).toMatchObject({ ok: false, error: "save failed" });
    mocks.gen.mockRejectedValueOnce({ message: "quota_exceeded" });
    expect((await useClassFeatureAskAdapter().run(proposal())).parts[0].error).toContain("limit of abilities");
  });
});
