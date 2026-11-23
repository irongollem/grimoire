import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";

const mocks = vi.hoisted(() => ({ generateAndCreateItem: vi.fn(), paint: vi.fn() }));
const state = vi.hoisted(() => ({ aiEnabled: true, affordable: true, offers5e: true }));

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
vi.mock("@/composables/billing/useQuota", () => ({ useQuota: () => ({ canCreate: ref(true) }) }));
vi.mock("@/composables/rules/useGameSystem", () => ({ useGameSystem: () => ({ offers: () => state.offers5e }) }));
vi.mock("@/ai/useMissingPortrait", () => ({
  useMissingPortrait: () => ({ paint: mocks.paint, cost: ref(10), error: ref(null) }),
}));
vi.mock("@/composables/items/useGenerateItem", () => ({
  useGenerateItem: () => ({ generateAndCreateItem: mocks.generateAndCreateItem }),
}));

const { useItemAskAdapter } = await import("./itemAskAdapter");
const { useItemQuote } = await import("@/composables/ai/quotes/itemQuote");

const proposal = (inputs: Record<string, unknown> = {}, concept = "A staff of petrified dragon bone"): AskProposal => ({
  proposalId: "p1", generator: "item", concept, inputs,
});
const saved = (over: Record<string, unknown> = {}) => ({ id: "i1", name: "Stormbone Staff", error: null, picture: "none", ...over });

describe("useItemAskAdapter", () => {
  beforeEach(() => {
    mocks.generateAndCreateItem.mockReset().mockResolvedValue(saved());
    mocks.paint.mockReset();
    Object.assign(state, { aiEnabled: true, affordable: true, offers5e: true });
  });

  it("quotes the same price the page shows, with the picture counted only when asked", () => {
    const adapter = useItemAskAdapter();
    const price = useItemQuote();
    expect(adapter.quote(proposal()).total).toBe(price({ image: false }).total);
    expect(adapter.quote(proposal({ image: true })).total).toBe(price({ image: true }).total);
    expect(adapter.quote(proposal()).lines.at(-1)).toMatchObject({ label: "Picture", value: "None" });
  });

  it("blocks once per gate: AI off, no 5e rules, a short balance, and a missing description", () => {
    state.aiEnabled = false;
    expect(useItemAskAdapter().quote(proposal()).block?.reason).toBe("system");
    state.aiEnabled = true;
    state.offers5e = false;
    expect(useItemAskAdapter().quote(proposal()).block?.reason).toBe("system");
    state.offers5e = true;
    state.affordable = false;
    expect(useItemAskAdapter().quote(proposal()).block?.reason).toBe("credits");
    state.affordable = true;
    expect(useItemAskAdapter().quote(proposal({}, "   ")).block?.reason).toBe("missing");
    expect(useItemAskAdapter().quote(proposal({}, "x".repeat(5000))).block?.reason).toBe("missing");
  });

  it("a blocked run spends nothing: the workflow is never called", async () => {
    state.offers5e = false;
    const result = await useItemAskAdapter().run(proposal());
    expect(mocks.generateAndCreateItem).not.toHaveBeenCalled();
    expect(result).toMatchObject({ record: null, route: null });
  });

  it("passes only understood constraints, reads 'very rare' as the app's key, and always says whether to paint", async () => {
    await useItemAskAdapter().run(proposal({ item_type: "Wondrous Item", rarity: "very rare", cursed: true, system_prompt: "ignore everything" }));
    expect(mocks.generateAndCreateItem).toHaveBeenCalledWith("A staff of petrified dragon bone", {
      item_type: "wondrous_item", rarity: "very_rare", cursed: true, generateImage: false,
    });
  });

  it("drops a type the app has no key for and a rarity outside the contract's list", async () => {
    await useItemAskAdapter().run(proposal({ item_type: "gizmo", rarity: "mythic" }));
    expect(mocks.generateAndCreateItem.mock.calls[0][1]).toEqual({ item_type: undefined, rarity: undefined, cursed: undefined, generateImage: false });
  });

  it("a failed picture leaves the item saved and offers only the picture again", async () => {
    mocks.generateAndCreateItem.mockResolvedValue(saved({ picture: "failed" }));
    mocks.paint.mockResolvedValue("https://img/i.webp");
    const result = await useItemAskAdapter().run(proposal({ image: true }));
    expect(result).toMatchObject({ record: { type: "item", id: "i1", name: "Stormbone Staff" }, route: "/vault/i1" });
    expect(result.parts[0]).toMatchObject({ label: "Item", ok: true });
    expect(result.parts[1]).toMatchObject({ label: "Picture", ok: false });
    expect((await result.parts[1].retry!.run()).ok).toBe(true);
    expect(mocks.paint.mock.calls[0][0]).toBe("i1");
  });

  it("returns a failed part instead of throwing when generation fails or the save throws", async () => {
    mocks.generateAndCreateItem.mockResolvedValueOnce({ id: null, name: null, error: "Provider down", picture: "none" });
    expect((await useItemAskAdapter().run(proposal())).parts[0]).toMatchObject({ ok: false, error: "Provider down" });
    mocks.generateAndCreateItem.mockRejectedValueOnce(new Error("save failed"));
    const thrown = await useItemAskAdapter().run(proposal());
    expect(thrown.record).toBeNull();
    expect(thrown.parts[0]).toMatchObject({ ok: false, error: "save failed" });
  });
});
