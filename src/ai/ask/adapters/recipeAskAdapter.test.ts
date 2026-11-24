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
vi.mock("@/composables/items/useItemIndex", () => ({
  useItemIndex: () => ({ data: { get value() { return state.lookups; } } }),
}));
vi.mock("@/composables/crafting/useGenerateRecipe", () => ({
  useGenerateRecipe: () => ({ generateAndCreateRecipe: mocks.gen }),
}));

const { useRecipeAskAdapter } = await import("./recipeAskAdapter");
const { useRecipeQuote } = await import("@/composables/ai/quotes/recipeQuote");

const ITEMS = [{ id: "i1", name: "Healing Potion" }];
const proposal = (inputs: Record<string, unknown> = {}, concept = "A smoky draught"): AskProposal => ({
  proposalId: "p1", generator: "recipe", concept, inputs,
});
const saved = (over: Record<string, unknown> = {}) => ({
  recipe: { id: "r1", name: "Dragonbreath Draught", partsFailure: null }, error: null, ...over,
});

describe("useRecipeAskAdapter", () => {
  beforeEach(() => {
    mocks.gen.mockReset();
    Object.assign(state, { aiEnabled: true, canCreate: true, affordable: true, offers: true, lookups: ITEMS });
    mocks.gen.mockResolvedValue(saved());
  });

  it("quotes the same price the page shows", () => {
    expect(useRecipeAskAdapter().quote(proposal()).total).toBe(useRecipeQuote()().total);
  });

  it("blocks once per gate: AI off, short balance, an empty description, and a campaign without 5e rules", async () => {
    const adapter = useRecipeAskAdapter();
    state.aiEnabled = false;
    expect(adapter.quote(proposal()).block?.reason).toBe("system");
    state.aiEnabled = true;
    state.affordable = false;
    expect(adapter.quote(proposal()).block?.reason).toBe("credits");
    state.affordable = true;
    expect(adapter.quote(proposal({}, "  ")).block?.reason).toBe("missing");
    // The server refuses a recipe without 5e rules even though the contract does not say so.
    state.offers = false;
    expect(adapter.quote(proposal()).block?.reason).toBe("system");
    const result = await adapter.run(proposal());
    expect(mocks.gen).not.toHaveBeenCalled();
    expect(result.record).toBeNull();
  });

  it("waits for the item catalogue, so an output that exists is not made a second time", async () => {
    state.lookups = undefined;
    const adapter = useRecipeAskAdapter();
    expect(adapter.quote(proposal()).block).toMatchObject({ reason: "missing" });
    await adapter.run(proposal());
    expect(mocks.gen).not.toHaveBeenCalled();
  });

  it("passes only an understood discipline, with the campaign's items to match the output against", async () => {
    await useRecipeAskAdapter().run(proposal({ discipline: "alchemy", system_prompt: "x" }));
    expect(mocks.gen).toHaveBeenCalledWith("A smoky draught", { discipline: "alchemy", items: ITEMS, output: null });
    mocks.gen.mockClear();
    await useRecipeAskAdapter().run(proposal({ discipline: "juggling" }));
    expect(mocks.gen).toHaveBeenCalledWith("A smoky draught", { discipline: undefined, items: ITEMS, output: null });
  });

  it("makes the item named by id, shows it in the quote, and ignores an id the campaign's items lack", async () => {
    const adapter = useRecipeAskAdapter();
    expect(adapter.quote(proposal({ output_item_id: "i1" })).lines.find((l) => l.label === "Makes")?.value).toBe("Healing Potion");
    await adapter.run(proposal({ output_item_id: "i1" }));
    expect(mocks.gen.mock.calls[0][1].output).toEqual(ITEMS[0]);
    mocks.gen.mockClear();
    await adapter.run(proposal({ output_item_id: "other-campaign" }));
    expect(mocks.gen.mock.calls[0][1].output).toBeNull();
  });

  it("a successful run names the recipe and opens it where the page does", async () => {
    const result = await useRecipeAskAdapter().run(proposal());
    expect(result).toMatchObject({ record: { id: "r1", name: "Dragonbreath Draught" }, route: "/crafting/r1" });
    expect(result.parts[0]).toMatchObject({ label: "Recipe text", ok: true });
  });

  it("a failed child write leaves the recipe saved and says what to check", async () => {
    mocks.gen.mockResolvedValue(saved({ recipe: { id: "r1", name: "Dragonbreath Draught", partsFailure: new Error("rls") } }));
    const result = await useRecipeAskAdapter().run(proposal());
    expect(result.record?.id).toBe("r1");
    expect(result.parts.map((p) => [p.label, p.ok])).toEqual([["Recipe text", true], ["Outputs and ingredients", false]]);
  });

  it("returns a failed part instead of throwing when generation fails or the save throws", async () => {
    mocks.gen.mockResolvedValueOnce({ recipe: null, error: "Provider down" });
    expect((await useRecipeAskAdapter().run(proposal())).parts[0]).toMatchObject({ ok: false, error: "Provider down" });
    mocks.gen.mockRejectedValueOnce(new Error("save failed"));
    expect((await useRecipeAskAdapter().run(proposal())).parts[0]).toMatchObject({ ok: false, error: "save failed" });
    mocks.gen.mockRejectedValueOnce({ message: "quota_exceeded" });
    expect((await useRecipeAskAdapter().run(proposal())).parts[0].error).toContain("limit of recipes");
  });
});
