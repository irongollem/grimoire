import { describe, expect, it, vi } from "vitest";
import { buildStarterRecipeChildRows, seedRecipeChildren, type RecipeChildWriters } from "./useCrafting";
import type { StarterRecipeDef } from "@/data/starterRecipes";

function recipe(overrides: Partial<StarterRecipeDef> = {}): StarterRecipeDef {
  return {
    name: "Improvised Torch",
    description: "A crude but reliable light source.",
    discipline: "woodcraft",
    dc: 8,
    crafting_time: 10,
    crafting_time_unit: "minutes",
    requires_proficiency: false,
    requires_tools: false,
    ingredients: [{ tags: ["wood"], quantity: 1 }],
    outputs: [{ name: "Torch", quantity: 3 }],
    ...overrides,
  };
}

describe("buildStarterRecipeChildRows", () => {
  it("correlates each recipe's children to its id by array position", () => {
    const defs = [
      recipe({ name: "Torch", outputs: [{ name: "Torch", quantity: 3 }] }),
      recipe({ name: "Torch", outputs: [{ name: "Torch", quantity: 3 }] }), // duplicate name on purpose
    ];
    const { ingredientRows, outputRows } = buildStarterRecipeChildRows(
      defs,
      ["recipe-a", "recipe-b"],
      new Map([["Torch", "item-torch"]]),
    );

    expect(ingredientRows.map((r) => r.recipe_id)).toEqual(["recipe-a", "recipe-b"]);
    expect(outputRows.map((r) => r.recipe_id)).toEqual(["recipe-a", "recipe-b"]);
  });

  it("drops outputs whose item wasn't found/created in the vault", () => {
    const defs = [recipe({ outputs: [{ name: "Torch", quantity: 3 }, { name: "Unknown Thing", quantity: 1 }] })];
    const { outputRows } = buildStarterRecipeChildRows(defs, ["recipe-a"], new Map([["Torch", "item-torch"]]));
    expect(outputRows).toEqual([{ recipe_id: "recipe-a", item_id: "item-torch", quantity: 3 }]);
  });

  it("carries ingredient tags/quantity through untouched with item_id null", () => {
    const defs = [recipe({ ingredients: [{ tags: ["wood", "cloth"], quantity: 2 }] })];
    const { ingredientRows } = buildStarterRecipeChildRows(defs, ["recipe-a"], new Map());
    expect(ingredientRows).toEqual([
      { recipe_id: "recipe-a", item_id: null, tags: ["wood", "cloth"], quantity: 2 },
    ]);
  });

  it("omits modifier rows when a recipe has none", () => {
    const defs = [recipe({ modifiers: undefined }), recipe({ modifiers: [{ description: "Fine tools", bonus: 2 }] })];
    const { modifierRows } = buildStarterRecipeChildRows(defs, ["recipe-a", "recipe-b"], new Map());
    expect(modifierRows).toEqual([{ recipe_id: "recipe-b", description: "Fine tools", bonus: 2 }]);
  });

  it("returns empty arrays for an empty recipe list", () => {
    expect(buildStarterRecipeChildRows([], [], new Map())).toEqual({
      ingredientRows: [], outputRows: [], modifierRows: [],
    });
  });
});

/** Fake writers for seedRecipeChildren — real ones hit supabase; these let
 *  the rollback orchestration be tested without a supabase double. */
function fakeWriters(overrides: Partial<RecipeChildWriters> = {}): RecipeChildWriters {
  return {
    insertIngredients: vi.fn<RecipeChildWriters["insertIngredients"]>().mockResolvedValue({ error: null }),
    insertOutputs: vi.fn<RecipeChildWriters["insertOutputs"]>().mockResolvedValue({ error: null }),
    insertModifiers: vi.fn<RecipeChildWriters["insertModifiers"]>().mockResolvedValue({ error: null }),
    deleteRecipes: vi.fn<RecipeChildWriters["deleteRecipes"]>().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("seedRecipeChildren", () => {
  it("rolls back exactly the given recipe ids and rethrows the original error when a child batch fails", async () => {
    const writers = fakeWriters({
      insertOutputs: vi.fn<RecipeChildWriters["insertOutputs"]>().mockResolvedValue({ error: new Error("outputs insert failed") }),
    });
    const defs = [recipe({ outputs: [{ name: "Torch", quantity: 3 }] })];

    await expect(
      seedRecipeChildren(defs, ["recipe-a"], new Map([["Torch", "item-torch"]]), writers),
    ).rejects.toThrow("outputs insert failed");

    expect(writers.deleteRecipes).toHaveBeenCalledOnce();
    expect(writers.deleteRecipes).toHaveBeenCalledWith(["recipe-a"]);
    // Ingredients ran (batched before outputs); modifiers never got a chance to.
    expect(writers.insertIngredients).toHaveBeenCalled();
    expect(writers.insertModifiers).not.toHaveBeenCalled();
  });

  it("does not delete anything when every child batch succeeds", async () => {
    const writers = fakeWriters();
    await seedRecipeChildren([recipe()], ["recipe-a"], new Map([["Torch", "item-torch"]]), writers);
    expect(writers.deleteRecipes).not.toHaveBeenCalled();
  });

  it("preserves the original error even when the rollback delete itself fails", async () => {
    const writers = fakeWriters({
      insertOutputs: vi.fn<RecipeChildWriters["insertOutputs"]>().mockResolvedValue({ error: new Error("outputs insert failed") }),
      deleteRecipes: vi.fn<RecipeChildWriters["deleteRecipes"]>().mockRejectedValue(new Error("delete also failed")),
    });
    await expect(
      seedRecipeChildren([recipe()], ["recipe-a"], new Map([["Torch", "item-torch"]]), writers),
    ).rejects.toThrow("outputs insert failed");
  });

  it("rolls back on a recipe/import-length mismatch too, deleting only the ids it was given", async () => {
    const writers = fakeWriters();
    await expect(
      seedRecipeChildren([recipe(), recipe()], ["only-one-id"], new Map(), writers),
    ).rejects.toThrow("mismatch");
    expect(writers.deleteRecipes).toHaveBeenCalledOnce();
    expect(writers.deleteRecipes).toHaveBeenCalledWith(["only-one-id"]);
    expect(writers.insertIngredients).not.toHaveBeenCalled();
  });

  it("is a no-op — no writers called, nothing to roll back — for an empty import", async () => {
    const writers = fakeWriters();
    await seedRecipeChildren([], [], new Map(), writers);
    expect(writers.insertIngredients).not.toHaveBeenCalled();
    expect(writers.deleteRecipes).not.toHaveBeenCalled();
  });
});
