import { describe, it, expect } from "vitest";
import { STARTER_RECIPES } from "./starterRecipes";
import { GEAR } from "./gear";
import { PROVISIONS } from "./provisions";
import { AMMUNITION } from "./ammunition";
import { CRAFTING_DISCIPLINES } from "@/lib/crafting/disciplines";
import { buildStarterRecipeChildRows } from "@/composables/crafting/useCrafting";
import { WORKSHOP_LIBRARY_EQUIVALENTS } from "./workshopLibraryEquivalents";
import { RULESET_KEYS } from "@/types/ruleset.types";

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

  it("names an output item that actually exists, in each edition, for every output", () => {
    // `buildStarterRecipeChildRows` resolves outputs by name and *drops* the
    // ones it can't find, so a typo'd or invented output name yields a recipe
    // that imports fine and then produces nothing when crafted. Four were live
    // in this table: "Illuminated Manuscript Page" and "Varnished Wooden Item"
    // (named no real item) and the two ammunition outputs (real items, but in
    // a list the importer wasn't reading).
    //
    // Resolution is per edition (#957): the SRD row from
    // WORKSHOP_LIBRARY_EQUIVALENTS where that edition has one, else a bundled
    // entry visible in that edition. These lists must stay in step with the
    // ones `useImportStarterRecipes` loads.
    const bundled = [...GEAR, ...PROVISIONS, ...AMMUNITION];
    const missing = RULESET_KEYS.flatMap((edition) => {
      const known = new Set([
        ...bundled.filter((item) => !item.ruleset || item.ruleset === edition).map((item) => item.name),
        ...Object.keys(WORKSHOP_LIBRARY_EQUIVALENTS).filter((name) => WORKSHOP_LIBRARY_EQUIVALENTS[name][edition]),
      ]);
      return STARTER_RECIPES.flatMap((recipe) =>
        recipe.outputs
          .filter((output) => !known.has(output.name))
          .map((output) => `${edition}: ${recipe.name} → ${output.name}`),
      );
    });
    expect(missing).toEqual([]);
  });

  it("uses a real discipline id for every recipe", () => {
    const ids = new Set(CRAFTING_DISCIPLINES.map((discipline) => discipline.id));
    const unknown = STARTER_RECIPES.filter((recipe) => !ids.has(recipe.discipline)).map(
      (recipe) => `${recipe.name} → ${recipe.discipline}`,
    );
    expect(unknown).toEqual([]);
  });

  it("resolves 'Craft Leather Barding' → 'Leather Barding' via the shared library even with an empty vault map (#819)", () => {
    // #819: a grimoire-bundled output is always present as a library_items row,
    // but there was once no column for a recipe output to reference one, so it
    // was silently dropped on any account without a vault copy by that name.
    // The "exists" check above only proves the name exists *somewhere*; this
    // proves the resolver actually reaches it when the vault has nothing.
    const recipeDef = STARTER_RECIPES.find((recipe) => recipe.name === "Craft Leather Barding");
    expect(recipeDef).toBeDefined();

    const { outputRows } = buildStarterRecipeChildRows(
      [recipeDef!],
      ["recipe-a"],
      new Map(), // nothing in the vault
      new Map([["Leather Barding", "srd_grimoire_bundled_leather_barding"]]),
    );

    expect(outputRows).toEqual([
      { recipe_id: "recipe-a", item_id: null, library_item_id: "srd_grimoire_bundled_leather_barding", quantity: 1 },
    ]);
  });
});
