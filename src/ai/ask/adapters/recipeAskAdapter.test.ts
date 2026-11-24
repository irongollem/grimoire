import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskPreviewAdapter, AskPreviewOutcome } from "@/lib/ask/askAdapter";

const mocks = vi.hoisted(() => ({ draft: vi.fn(), save: vi.fn() }));
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
  useGenerateRecipe: () => ({ generateRecipeDraft: mocks.draft, saveRecipe: mocks.save }),
}));

const { useRecipeAskAdapter } = await import("./recipeAskAdapter");
const { useRecipeQuote } = await import("@/composables/ai/quotes/recipeQuote");

const ITEMS = [{ id: "i1", name: "Healing Potion" }];
const proposal = (inputs: Record<string, unknown> = {}, concept = "A smoky draught"): AskProposal => ({
  proposalId: "p1", generator: "recipe", concept, inputs,
});
const drafted = (over: Record<string, unknown> = {}) => ({
  draft: {
    recipe: {
      name: "Dragonbreath Draught", discipline: "alchemy", dc: 14, crafting_time: 1, crafting_time_unit: "hours",
      ingredients: [{ tags: ["herb"], quantity: 2 }, { tags: ["scale", "ash"], quantity: 1 }], modifiers: [],
      output: { name: "Fire Draught", quantity: 2 },
    },
    resolution: { kind: "create", draft: { name: "Fire Draught" } },
    ...over,
  },
  error: null,
});
const savedRecipe = (over: Record<string, unknown> = {}) => ({ id: "r1", name: "Dragonbreath Draught", partsFailure: null, ...over });

async function previewed(adapter: AskPreviewAdapter, p: AskProposal) {
  const outcome: AskPreviewOutcome = await adapter.preview(p);
  if (!outcome.ok) throw new Error("expected a preview");
  return outcome.preview;
}

describe("useRecipeAskAdapter", () => {
  beforeEach(() => {
    mocks.draft.mockReset().mockResolvedValue(drafted());
    mocks.save.mockReset().mockResolvedValue(savedRecipe());
    Object.assign(state, { aiEnabled: true, canCreate: true, affordable: true, offers: true, lookups: ITEMS });
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
    expect((await adapter.preview(proposal())).ok).toBe(false);
    expect(mocks.draft).not.toHaveBeenCalled();
  });

  it("waits for the item catalogue, so an output that exists is not made a second time", async () => {
    state.lookups = undefined;
    const adapter = useRecipeAskAdapter();
    expect(adapter.quote(proposal()).block).toMatchObject({ reason: "missing" });
    await adapter.preview(proposal());
    expect(mocks.draft).not.toHaveBeenCalled();
  });

  it("passes only an understood discipline, with the campaign's items to match the output against", async () => {
    await useRecipeAskAdapter().preview(proposal({ discipline: "alchemy", system_prompt: "x" }));
    expect(mocks.draft).toHaveBeenCalledWith("A smoky draught", { discipline: "alchemy", items: ITEMS, output: null });
    await useRecipeAskAdapter().preview(proposal({ discipline: "juggling" }));
    expect(mocks.draft).toHaveBeenLastCalledWith("A smoky draught", { discipline: undefined, items: ITEMS, output: null });
  });

  it("makes the item named by id, shows it in the quote, and ignores an id the campaign's items lack", async () => {
    const adapter = useRecipeAskAdapter();
    expect(adapter.quote(proposal({ output_item_id: "i1" })).lines.find((l) => l.label === "Makes")?.value).toBe("Healing Potion");
    await adapter.preview(proposal({ output_item_id: "i1" }));
    expect(mocks.draft.mock.calls[0][1].output).toEqual(ITEMS[0]);
    await adapter.preview(proposal({ output_item_id: "other-campaign" }));
    expect(mocks.draft.mock.calls[1][1].output).toBeNull();
  });

  // Bug caught: generating writing the recipe (and its invented output item), so Discard still left them behind.
  it("holds the recipe until the DM creates it, and Create saves the draft that was shown", async () => {
    const preview = await previewed(useRecipeAskAdapter(), proposal());
    expect(mocks.save).not.toHaveBeenCalled();
    const made = await preview.create();
    expect(mocks.save).toHaveBeenCalledWith(drafted().draft);
    expect(made).toMatchObject({ record: { id: "r1", name: "Dragonbreath Draught" }, route: "/crafting/r1" });
    expect(made.parts[0]).toMatchObject({ label: "Recipe text", ok: true, credits: 1 });
  });

  it("shows the difficulty, the time, the ingredients and what it makes", async () => {
    const { shown } = await previewed(useRecipeAskAdapter(), proposal());
    expect(shown.title).toBe("Dragonbreath Draught");
    expect(shown.badge).toBe("Alchemy");
    expect(shown.sections[0].rows).toEqual([
      { label: "Difficulty", detail: "DC 14" },
      { label: "Crafting time", detail: "1 hour" },
      { label: "2 ingredients", detail: "2 x herb, 1 x scale + ash" },
    ]);
    expect(shown.sections[1]).toEqual({ heading: "Makes", rows: [{ label: "Creates a new item: Fire Draught", detail: "Quantity 2" }] });
  });

  it("a failed child write leaves the recipe saved and says what to check", async () => {
    mocks.save.mockResolvedValue(savedRecipe({ partsFailure: new Error("rls") }));
    const made = await (await previewed(useRecipeAskAdapter(), proposal())).create();
    expect(made.record?.id).toBe("r1");
    expect(made.parts.map((p) => [p.label, p.ok])).toEqual([["Recipe text", true], ["Outputs and ingredients", false]]);
  });

  it("ends with a failed part, and no preview, when generation fails or throws", async () => {
    mocks.draft.mockResolvedValueOnce({ draft: null, error: "Provider down" });
    expect(await useRecipeAskAdapter().preview(proposal())).toMatchObject({ ok: false, result: { parts: [{ ok: false, error: "Provider down" }] } });
    mocks.draft.mockRejectedValueOnce(new Error("offline"));
    expect(await useRecipeAskAdapter().preview(proposal())).toMatchObject({ ok: false, result: { parts: [{ ok: false, error: "offline" }] } });
  });

  // Bug caught: a save that lost the quota race threw instead of leaving the preview to retry.
  it("a save that fails says why and records nothing, instead of throwing", async () => {
    const preview = await previewed(useRecipeAskAdapter(), proposal());
    mocks.save.mockRejectedValueOnce({ message: "quota_exceeded" });
    expect((await preview.create()).parts[0].error).toContain("limit of recipes");
    mocks.save.mockRejectedValueOnce(new Error("save failed"));
    expect(await preview.create()).toMatchObject({ record: null, parts: [{ ok: false, error: "save failed" }] });
  });
});
