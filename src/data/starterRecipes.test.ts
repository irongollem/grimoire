import { describe, it, expect } from "vitest";
import { STARTER_RECIPES } from "./starterRecipes";
import { GEAR } from "./gear";
import { PROVISIONS } from "./provisions";
import { AMMUNITION } from "./ammunition";
import { CRAFTING_DISCIPLINES } from "@/lib/crafting-disciplines";

/**
 * Invariants over the starter-recipe table. Both of these shipped broken and
 * neither showed up as a failure anywhere — the import succeeds either way, so
 * the damage only appears in a DM's campaign weeks later.
 */
describe("STARTER_RECIPES", () => {
  it("has no duplicate recipe names", () => {
    // `useImportStarterRecipes` de-dupes against rows already in the database,
    // never within this array, so a name appearing twice here imports twice and
    // every player sees a doubled card. The whole `painting` block was a second
    // copy of itself for exactly this reason.
    const seen = new Map<string, number>();
    for (const recipe of STARTER_RECIPES) {
      seen.set(recipe.name, (seen.get(recipe.name) ?? 0) + 1);
    }
    const duplicated = [...seen.entries()].filter(([, count]) => count > 1).map(([name]) => name);
    expect(duplicated).toEqual([]);
  });

  it("names an output item that actually exists for every output", () => {
    // `buildStarterRecipeChildRows` resolves outputs by name and *drops* the
    // ones it can't find, so a typo'd or invented output name yields a recipe
    // that imports fine and then produces nothing when crafted. Four were live
    // in this table: "Illuminated Manuscript Page" and "Varnished Wooden Item"
    // (named no real item) and the two ammunition outputs (real items, but in
    // a list the importer wasn't reading).
    //
    // These three lists must stay in step with the ones `useImportStarterRecipes`
    // loads — an item the importer can't see is as good as absent.
    const known = new Set([...GEAR, ...PROVISIONS, ...AMMUNITION].map((item) => item.name));
    const missing = STARTER_RECIPES.flatMap((recipe) =>
      recipe.outputs.filter((output) => !known.has(output.name)).map((output) => `${recipe.name} → ${output.name}`),
    );
    expect(missing).toEqual([]);
  });

  it("uses a real discipline id for every recipe", () => {
    const ids = new Set(CRAFTING_DISCIPLINES.map((discipline) => discipline.id));
    const unknown = STARTER_RECIPES.filter((recipe) => !ids.has(recipe.discipline)).map(
      (recipe) => `${recipe.name} → ${recipe.discipline}`,
    );
    expect(unknown).toEqual([]);
  });
});
