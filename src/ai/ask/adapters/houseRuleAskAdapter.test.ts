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
vi.mock("@/composables/rules/useGenerateCustomRule", () => ({
  useGenerateCustomRule: () => ({ generateAndCreateRule: mocks.gen }),
}));

const { useHouseRuleAskAdapter } = await import("./houseRuleAskAdapter");
const { useHouseRuleQuote } = await import("@/composables/ai/quotes/houseRuleQuote");

const proposal = (inputs: Record<string, unknown> = {}, concept = "A test concept"): AskProposal => ({
  proposalId: "p1", generator: "house_rule", concept, inputs,
});
const saved = (over: Record<string, unknown> = {}) => ({ id: "r1", name: "Sanity", error: null, ...over });

describe("useHouseRuleAskAdapter", () => {
  beforeEach(() => {
    mocks.gen.mockReset();
    Object.assign(state, { aiEnabled: true, canCreate: true, affordable: true, offers: true });
    mocks.gen.mockResolvedValue(saved());
  });

  it("quotes the same price the page shows", () => {
    const adapter = useHouseRuleAskAdapter();
    const pageQuote = useHouseRuleQuote();
    expect(adapter.quote(proposal()).total).toBe(pageQuote().total);
  });

  it("blocks once per gate: AI off, short balance, and an empty description", () => {
    const adapter = useHouseRuleAskAdapter();
    state.aiEnabled = false;
    expect(adapter.quote(proposal()).block?.reason).toBe("system");
    state.aiEnabled = true;
    state.affordable = false;
    expect(adapter.quote(proposal()).block?.reason).toBe("credits");
    state.affordable = true;
    expect(adapter.quote(proposal({}, "  ")).block?.reason).toBe("missing");
  });

  it("is not 5e-only: a campaign without 5e rules is not blocked", () => {
    state.offers = false;
    expect(useHouseRuleAskAdapter().quote(proposal()).block).toBeNull();
  });

  it("passes only understood constraints and drops what the page's own picker does not offer", async () => {
    await useHouseRuleAskAdapter().run(proposal({ category: "combat", system_prompt: "x" }));
    expect(mocks.gen).toHaveBeenCalledWith("A test concept", { category: "Combat", allowTracker: false });
    mocks.gen.mockClear();
    await useHouseRuleAskAdapter().run(proposal({ category: "Vibes" }));
    expect(mocks.gen).toHaveBeenCalledWith("A test concept", { category: undefined, allowTracker: false });
  });

  // Bug caught: the tracker switch was hard-wired on, so a DM who turned it off on the card still got a tracker.
  it("allows a tracker only when the card's switch is on, and says so on the quote", async () => {
    const adapter = useHouseRuleAskAdapter();
    expect(adapter.quote(proposal({ allow_tracker: true })).lines).toContainEqual(expect.objectContaining({ label: "Tracker", value: "Allowed" }));
    await adapter.run(proposal({ allow_tracker: true }));
    expect(mocks.gen).toHaveBeenCalledWith("A test concept", { category: undefined, allowTracker: true });
  });

  it("a successful run names the record and opens it where the page does", async () => {
    const result = await useHouseRuleAskAdapter().run(proposal());
    expect(result).toMatchObject({ record: { type: "other" }, route: "/rules/r1" });
    expect(result.parts[0]).toMatchObject({ label: "Rule text", ok: true });
  });

  it("returns a failed part instead of throwing when generation fails or the save throws", async () => {
    mocks.gen.mockResolvedValueOnce({ id: null, name: null, error: "Provider down" });
    expect((await useHouseRuleAskAdapter().run(proposal())).parts[0]).toMatchObject({ ok: false, error: "Provider down" });
    mocks.gen.mockRejectedValueOnce(new Error("save failed"));
    expect((await useHouseRuleAskAdapter().run(proposal())).parts[0]).toMatchObject({ ok: false, error: "save failed" });
    mocks.gen.mockRejectedValueOnce({ message: "quota_exceeded" });
    expect((await useHouseRuleAskAdapter().run(proposal())).parts[0].error).toContain("limit of rules");
  });
});
