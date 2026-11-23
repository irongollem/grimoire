import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const mocks = vi.hoisted(() => ({
  createItem: vi.fn(), createRecipe: vi.fn(), outputs: vi.fn(), ingredients: vi.fn(), modifiers: vi.fn(),
  generate: vi.fn(), clearCompleted: vi.fn(),
}));
const busy = ref(false);
const error = ref<string | null>(null);

vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "c1" }) }));
vi.mock("@/composables/items/useItems", () => ({ useCreateItem: () => ({ mutateAsync: mocks.createItem }) }));
vi.mock("@/composables/crafting/useCrafting", () => ({
  useCreateRecipe: () => ({ mutateAsync: mocks.createRecipe }),
  useReplaceOutputs: () => ({ mutateAsync: mocks.outputs }),
  useReplaceIngredients: () => ({ mutateAsync: mocks.ingredients }),
  useReplaceModifiers: () => ({ mutateAsync: mocks.modifiers }),
}));
vi.mock("@/ai/useRecipeGeneration", () => ({
  useRecipeGeneration: () => ({ generate: mocks.generate, error, concept: ref(""), clearCompleted: mocks.clearCompleted }),
}));
vi.mock("@/ai/useNpcGeneration", () => ({ toTiptapJson: (t: string) => ({ type: "doc", text: t }) }));
vi.mock("@/ai/aiGeneratorRegistry", () => ({ isAnyAiGenerating: busy }));

const { useGenerateRecipe, resolveRecipeOutputFor } = await import("./useGenerateRecipe");

const UUID = "11111111-1111-4111-8111-111111111111";
const recipe = (over: Record<string, unknown> = {}) => ({
  name: "Dragonbreath Draught", description: "", discipline: "alchemy", dc: 14, crafting_time: 1, crafting_time_unit: "hours",
  requires_proficiency: false, requires_tools: false, ingredients: [{ tags: ["herb"], quantity: 2 }], modifiers: [],
  output: { name: "Fire Draught", quantity: 1, item_type: "potion", rarity: "uncommon", description: "Breathe fire" },
  ai_provenance: null, ...over,
});

describe("useGenerateRecipe", () => {
  beforeEach(() => {
    mocks.createItem.mockReset().mockResolvedValue({ id: "item1" });
    mocks.createRecipe.mockReset().mockResolvedValue({ id: "r1" });
    mocks.outputs.mockReset().mockResolvedValue(undefined);
    mocks.ingredients.mockReset().mockResolvedValue(undefined);
    mocks.modifiers.mockReset().mockResolvedValue(undefined);
    mocks.generate.mockReset().mockResolvedValue(recipe());
    busy.value = false;
    error.value = null;
  });

  it("makes the output item the model invented, then the recipe, then points the recipe's outputs at that item", async () => {
    const outcome = await useGenerateRecipe().generateAndCreateRecipe("a draught", { items: [] });
    expect(mocks.createItem).toHaveBeenCalledWith(expect.objectContaining({ name: "Fire Draught", source: "Grimoire:AI", campaign_id: "c1" }));
    expect(mocks.outputs).toHaveBeenCalledWith({ recipeId: "r1", outputs: [{ item_id: "item1", library_item_id: null, quantity: 1 }] });
    expect(outcome.recipe).toMatchObject({ id: "r1", name: "Dragonbreath Draught", partsFailure: null });
  });

  it("uses an item the campaign already has by that name instead of making a duplicate", async () => {
    await useGenerateRecipe().generateAndCreateRecipe("a draught", { items: [{ id: UUID, name: "fire draught" }] });
    expect(mocks.createItem).not.toHaveBeenCalled();
    expect(mocks.outputs).toHaveBeenCalledWith({ recipeId: "r1", outputs: [{ item_id: UUID, library_item_id: null, quantity: 1 }] });
  });

  it("throws, writing no recipe, when the output item cannot be made", async () => {
    mocks.createItem.mockRejectedValue(new Error("item failed"));
    await expect(useGenerateRecipe().generateAndCreateRecipe("a draught", { items: [] })).rejects.toThrow("item failed");
    expect(mocks.createRecipe).not.toHaveBeenCalled();
  });

  it("keeps the recipe and reports it when a child write fails, rather than throwing and stranding it", async () => {
    mocks.ingredients.mockRejectedValue(new Error("rls"));
    const outcome = await useGenerateRecipe().generateAndCreateRecipe("a draught", { items: [] });
    expect(outcome.recipe).toMatchObject({ id: "r1" });
    expect(outcome.recipe?.partsFailure).toBeInstanceOf(Error);
    expect(mocks.modifiers).not.toHaveBeenCalled();
  });

  it("creates nothing while another generation is running, and says why when generation fails", async () => {
    busy.value = true;
    expect(await useGenerateRecipe().generateAndCreateRecipe("a draught", { items: [] })).toMatchObject({ recipe: null });
    expect(mocks.generate).not.toHaveBeenCalled();
    busy.value = false;
    mocks.generate.mockResolvedValue(null);
    error.value = "Provider down";
    expect(await useGenerateRecipe().generateAndCreateRecipe("a draught", { items: [] })).toMatchObject({ recipe: null, error: "Provider down" });
  });

  it("does not pass the items to the generator: they are for matching the output, not for the model", async () => {
    await useGenerateRecipe().generateAndCreateRecipe("a draught", { discipline: "alchemy", items: [] });
    expect(mocks.generate.mock.calls[0][1]).toEqual({ discipline: "alchemy" });
  });
});

describe("resolveRecipeOutputFor", () => {
  it("prefers the item the DM picked, as a campaign item for a uuid and a library item for a text id", () => {
    expect(resolveRecipeOutputFor(recipe() as never, [], { id: UUID, name: "Mine" })).toEqual({ kind: "campaign", item_id: UUID, name: "Mine" });
    expect(resolveRecipeOutputFor(recipe() as never, [], { id: "srd_potion", name: "Potion" })).toEqual({ kind: "library", library_item_id: "srd_potion", name: "Potion" });
  });

  it("matches the model's output against campaign items before library ones, never by a partial name", () => {
    const items = [{ id: "srd_fire", name: "Fire Draught" }, { id: UUID, name: "Fire Draught" }, { id: "srd_g", name: "Greater Fire Draught" }];
    expect(resolveRecipeOutputFor(recipe() as never, items, null)).toMatchObject({ kind: "campaign", item_id: UUID });
    expect(resolveRecipeOutputFor(recipe() as never, [{ id: "srd_g", name: "Greater Fire Draught" }], null).kind).toBe("create");
  });
});
