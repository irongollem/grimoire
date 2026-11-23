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
    textIsByok: ref(false), imageIsByok: ref(false), imageProvider: ref("openai"),
    textCredits: (base: number) => base, imageCredits: (base: number) => base * 10,
  }),
}));
vi.mock("@/composables/billing/useQuota", () => ({ useQuota: () => ({ canCreate: { get value() { return state.canCreate; } } }) }));
vi.mock("@/composables/rules/useGameSystem", () => ({ useGameSystem: () => ({ offers: () => state.offers }) }));
vi.mock("@/composables/rules/useGenerateBackground", () => ({
  useGenerateBackground: () => ({ generateAndCreateBackground: mocks.gen }),
}));

const { useBackgroundAskAdapter } = await import("./backgroundAskAdapter");
const { useBackgroundQuote } = await import("@/composables/ai/quotes/backgroundQuote");

const proposal = (inputs: Record<string, unknown> = {}, concept = "A test concept"): AskProposal => ({
  proposalId: "p1", generator: "background", concept, inputs,
});
const saved = (over: Record<string, unknown> = {}) => ({ id: "b1", name: "Lamplighter", error: null, ...over });

describe("useBackgroundAskAdapter", () => {
  beforeEach(() => {
    mocks.gen.mockReset();
    Object.assign(state, { aiEnabled: true, canCreate: true, affordable: true, offers: true });
    mocks.gen.mockResolvedValue(saved());
  });

  it("quotes the same price the page shows", () => {
    const adapter = useBackgroundAskAdapter();
    const pageQuote = useBackgroundQuote();
    expect(adapter.quote(proposal()).total).toBe(pageQuote().total);
  });

  it("blocks once per gate: AI off, short balance, and an empty description", () => {
    const adapter = useBackgroundAskAdapter();
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
    const adapter = useBackgroundAskAdapter();
    expect(adapter.quote(proposal()).block?.reason).toBe("system");
    const result = await adapter.run(proposal());
    expect(mocks.gen).not.toHaveBeenCalled();
    expect(result.record).toBeNull();
  });

  it("passes only understood constraints and drops what the page's own picker does not offer", async () => {
    await useBackgroundAskAdapter().run(proposal({ skill_focus: "animal handling", system_prompt: "x" }));
    expect(mocks.gen).toHaveBeenCalledWith("A test concept", { skill_focus: "Animal Handling" });
    mocks.gen.mockClear();
    await useBackgroundAskAdapter().run(proposal({ skill_focus: "Juggling" }));
    expect(mocks.gen).toHaveBeenCalledWith("A test concept", { skill_focus: undefined });
  });

  it("a successful run names the record and opens it where the page does", async () => {
    const result = await useBackgroundAskAdapter().run(proposal());
    expect(result).toMatchObject({ record: { type: "other" }, route: "/backgrounds/b1" });
    expect(result.parts[0]).toMatchObject({ label: "Background text", ok: true });
  });

  it("returns a failed part instead of throwing when generation fails or the save throws", async () => {
    mocks.gen.mockResolvedValueOnce({ id: null, name: null, error: "Provider down" });
    expect((await useBackgroundAskAdapter().run(proposal())).parts[0]).toMatchObject({ ok: false, error: "Provider down" });
    mocks.gen.mockRejectedValueOnce(new Error("save failed"));
    expect((await useBackgroundAskAdapter().run(proposal())).parts[0]).toMatchObject({ ok: false, error: "save failed" });
    mocks.gen.mockRejectedValueOnce({ message: "quota_exceeded" });
    expect((await useBackgroundAskAdapter().run(proposal())).parts[0].error).toContain("limit of backgrounds");
  });
});
