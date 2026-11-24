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
vi.mock("@/composables/rules/useGenerateSpecies", () => ({
  useGenerateSpecies: () => ({ generateAndCreateSpecies: mocks.gen }),
}));

const { useSpeciesAskAdapter } = await import("./speciesAskAdapter");
const { useSpeciesQuote } = await import("@/composables/ai/quotes/speciesQuote");

const proposal = (inputs: Record<string, unknown> = {}, concept = "A test concept"): AskProposal => ({
  proposalId: "p1", generator: "species", concept, inputs,
});
const saved = (over: Record<string, unknown> = {}) => ({ id: "s1", name: "Emberfolk", error: null, picture: "none", ...over });

describe("useSpeciesAskAdapter", () => {
  beforeEach(() => {
    mocks.gen.mockReset();
    Object.assign(state, { aiEnabled: true, canCreate: true, affordable: true, offers: true });
    mocks.gen.mockResolvedValue(saved());
  });

  it("quotes the same price the page shows, with the picture counted only when asked", () => {
    const adapter = useSpeciesAskAdapter();
    const pageQuote = useSpeciesQuote();
    expect(adapter.quote(proposal()).total).toBe(pageQuote({ image: false }).total);
    expect(adapter.quote(proposal({ image: true })).total).toBe(pageQuote({ image: true }).total);
  });

  it("blocks once per gate: AI off, short balance, and an empty description", () => {
    const adapter = useSpeciesAskAdapter();
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
    const adapter = useSpeciesAskAdapter();
    expect(adapter.quote(proposal()).block?.reason).toBe("system");
    const result = await adapter.run(proposal());
    expect(mocks.gen).not.toHaveBeenCalled();
    expect(result.record).toBeNull();
  });

  it("passes only understood constraints and drops what the page's own picker does not offer", async () => {
    await useSpeciesAskAdapter().run(proposal({ size: "Small", image: false, system_prompt: "x" }));
    expect(mocks.gen).toHaveBeenCalledWith("A test concept", { size: "small", generateImage: false });
    mocks.gen.mockClear();
    await useSpeciesAskAdapter().run(proposal({ size: "gigantic" }));
    expect(mocks.gen).toHaveBeenCalledWith("A test concept", { size: undefined, generateImage: false });
  });

  it("a successful run names the record and opens it where the page does", async () => {
    const result = await useSpeciesAskAdapter().run(proposal());
    expect(result).toMatchObject({ record: { type: "other" }, route: "/species/s1" });
    expect(result.parts[0]).toMatchObject({ label: "Species text", ok: true });
  });

  it("returns a failed part instead of throwing when generation fails or the save throws", async () => {
    mocks.gen.mockResolvedValueOnce({ id: null, name: null, error: "Provider down", picture: "none" });
    expect((await useSpeciesAskAdapter().run(proposal())).parts[0]).toMatchObject({ ok: false, error: "Provider down" });
    mocks.gen.mockRejectedValueOnce(new Error("save failed"));
    expect((await useSpeciesAskAdapter().run(proposal())).parts[0]).toMatchObject({ ok: false, error: "save failed" });
    mocks.gen.mockRejectedValueOnce({ message: "quota_exceeded" });
    expect((await useSpeciesAskAdapter().run(proposal())).parts[0].error).toContain("limit of species");
  });

  it("a failed picture leaves the species saved and says so, with no retry Ask cannot honour", async () => {
    mocks.gen.mockResolvedValue(saved({ picture: "failed" }));
    const result = await useSpeciesAskAdapter().run(proposal({ image: true }));
    expect(result.record).toMatchObject({ id: "s1", name: "Emberfolk" });
    expect(result.parts[1]).toMatchObject({ label: "Picture", ok: false });
    expect(result.parts[1].retry).toBeUndefined();
  });

  it("never paints a picture nobody asked for", async () => {
    await useSpeciesAskAdapter().run(proposal());
    expect(mocks.gen.mock.calls[0][1]).toMatchObject({ generateImage: false });
  });

  // Bug caught: a painted species was saved but never reached the result card, so the DM could not see it in the chat.
  it("puts a saved picture's URL on the result so the chat can show it, and leaves it unset when the picture failed", async () => {
    mocks.gen.mockResolvedValueOnce(saved({ picture: "saved", pictureUrl: "https://img/species.webp" }));
    expect((await useSpeciesAskAdapter().run(proposal({ image: true }))).picture).toBe("https://img/species.webp");
    mocks.gen.mockResolvedValueOnce(saved({ picture: "failed", pictureUrl: null }));
    expect((await useSpeciesAskAdapter().run(proposal({ image: true }))).picture).toBeUndefined();
  });
});
