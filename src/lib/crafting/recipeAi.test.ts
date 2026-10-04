import { describe, expect, it } from "vitest";
import {
  describeOutputResolution,
  normalizeRecipeAi,
  normalizeTags,
  resolveRecipeOutput,
  type RecipeAiOutput,
} from "./recipeAi";

const goodRaw = {
  name: "Brew of Embers",
  discipline: "alchemy",
  description: "A smoky draught.",
  dc: 14,
  crafting_time: 4,
  crafting_time_unit: "hours",
  requires_proficiency: true,
  requires_tools: true,
  ingredients: [{ tags: ["Herb", " rare "], quantity: 2 }],
  modifiers: [{ description: "Done under moonlight", bonus: 2 }],
  output: { name: "Ember Draught", quantity: 1, description: "Warm.", rarity: "uncommon", item_type: "potion" },
};

describe("normalizeRecipeAi", () => {
  it("passes a well-formed recipe through", () => {
    const r = normalizeRecipeAi(goodRaw);
    expect(r?.discipline).toBe("alchemy");
    expect(r?.ingredients).toEqual([{ tags: ["herb", "rare"], quantity: 2 }]);
    expect(r?.output.item_type).toBe("potion");
  });

  it("rejects non-objects and recipes without a name or output", () => {
    expect(normalizeRecipeAi(null)).toBeNull();
    expect(normalizeRecipeAi("x")).toBeNull();
    expect(normalizeRecipeAi({ ...goodRaw, name: " " })).toBeNull();
    expect(normalizeRecipeAi({ ...goodRaw, output: undefined })).toBeNull();
    expect(normalizeRecipeAi({ ...goodRaw, output: { name: "" } })).toBeNull();
  });

  it("falls back on unknown enums", () => {
    const r = normalizeRecipeAi({
      ...goodRaw,
      discipline: "necromancy",
      crafting_time_unit: "fortnights",
      output: { ...goodRaw.output, rarity: "mythic", item_type: "gizmo" },
    }, "smithing");
    expect(r?.discipline).toBe("smithing");
    expect(r?.crafting_time_unit).toBe("days");
    expect(r?.output.rarity).toBe("common");
    expect(r?.output.item_type).toBe("wondrous_item");
  });

  it("clamps numbers and defaults non-numbers", () => {
    const r = normalizeRecipeAi({ ...goodRaw, dc: 99, crafting_time: -3 });
    expect(r?.dc).toBe(30);
    expect(r?.crafting_time).toBe(1);
    expect(normalizeRecipeAi({ ...goodRaw, dc: 1 })?.dc).toBe(5);
    expect(normalizeRecipeAi({ ...goodRaw, dc: "abc" })?.dc).toBe(12);
  });

  it("drops empty ingredients, floors quantity at 1, and caps counts", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ tags: [`t${i}`], quantity: 0 }));
    const r = normalizeRecipeAi({ ...goodRaw, ingredients: [{ tags: [], quantity: 2 }, ...many] });
    expect(r?.ingredients).toHaveLength(5);
    expect(r?.ingredients.every((i) => i.quantity === 1)).toBe(true);
    const m = normalizeRecipeAi({
      ...goodRaw,
      modifiers: [1, 2, 3].map((n) => ({ description: `m${n}`, bonus: 2 })).concat([{ description: "", bonus: 1 }]),
    });
    expect(m?.modifiers).toHaveLength(2);
  });
});

describe("normalizeTags", () => {
  it("lowercases, trims, dedupes and ignores non-strings", () => {
    expect(normalizeTags([" Herb", "herb", 4, "", "RARE"])).toEqual(["herb", "rare"]);
    expect(normalizeTags("herb")).toEqual([]);
  });
});

describe("resolveRecipeOutput", () => {
  const output: RecipeAiOutput = {
    name: "Ember Draught", quantity: 1, description: "Warm.", rarity: "uncommon", item_type: "potion",
  };

  it("prefers a campaign item, case-insensitively", () => {
    const r = resolveRecipeOutput(output, [{ id: "u1", name: "ember draught" }], [{ id: "lib_1", name: "Ember Draught" }]);
    expect(r).toEqual({ kind: "campaign", item_id: "u1", name: "ember draught" });
  });

  it("falls back to the library", () => {
    const r = resolveRecipeOutput(output, [], [{ id: "lib_1", name: "EMBER DRAUGHT" }]);
    expect(r.kind).toBe("library");
  });

  it("drafts a new item when nothing matches exactly", () => {
    const r = resolveRecipeOutput(output, [{ id: "u1", name: "Greater Ember Draught" }], []);
    expect(r).toEqual({
      kind: "create",
      draft: { name: "Ember Draught", item_type: "potion", rarity: "uncommon", description: "Warm." },
    });
    expect(describeOutputResolution(r)).toBe("Creates a new item: Ember Draught");
  });
});
