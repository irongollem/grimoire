import { describe, it, expect } from "vitest";
import { validateInvention, type InventionCandidate, type InventionContext } from "./validate.ts";
import type { InventionBenchEntry, ItemRarity } from "./types.ts";

function row(rarity: ItemRarity, cost: string | null, dishes = 1, id = "r1"): InventionBenchEntry {
  return { row_id: id, dishes, item_id: `item-${id}`, library_item_id: null, name: `Mat ${id}`, rarity, item_type: "crafting_material", cost, tags: [] };
}
function ctx(over: Partial<InventionContext> = {}): InventionContext {
  return {
    mode: "materials",
    discipline: "tinkering",
    valueMultiple: 2,
    bench: [row("common", "50 gp", 2)],
    outputCandidates: [],
    materialCandidates: [],
    ...over,
  };
}
function cand(key: string, name: string, rarity: ItemRarity, over: Partial<InventionCandidate> = {}): InventionCandidate {
  return { key, ref: { item_id: `id-${key}` }, name, rarity, item_type: "gear", cost: "10 gp", requires_attunement: false, charges: null, spell_count: 0, ...over };
}
function newItem(over: Record<string, unknown> = {}) {
  return { name: "Singing Bird", item_type: "gear", subtype: null, rarity: "common", value_cp: 8000, weight: 1, flavor: "A clockwork bird.", rules_text: "It sings when someone enters.", requires_attunement: false, attunement_requirements: null, charges: null, recharge: null, damage_dice: null, damage_type: null, armor_class: null, properties: [], ...over };
}
function raw(over: Record<string, unknown> = {}, item: Record<string, unknown> = {}) {
  return {
    output: { new: newItem(item) },
    mechanics: [{ kind: "minor", text: "Sings when someone enters." }],
    quantity: 1,
    recipe: { name: "Singing Bird", description: "Wind the spring.", crafting_time: 6, crafting_time_unit: "days", dc: 12 },
    ...over,
  };
}
function draft(r: unknown, c: InventionContext) {
  const v = validateInvention(r, c);
  if (v.kind !== "draft") throw new Error(JSON.stringify(v));
  return v.draft;
}
function errors(r: unknown, c: InventionContext): string[] {
  const v = validateInvention(r, c);
  if (v.kind !== "invalid") throw new Error(`expected invalid, got ${v.kind}`);
  return v.errors;
}

describe("a plain valid draft", () => {
  it("passes untouched, with totals", () => {
    const d = draft(raw(), ctx());
    expect(d.materials_value_cp).toBe(10000);
    expect(d.value_limit_cp).toBe(20000);
    expect(d.rarity_ceiling).toBe("common");
    expect(d.adjustments).toEqual([]);
    expect(d.warnings).toEqual([]);
    expect(d.item.new?.cost).toBe("80 gp");
    expect(d.item.new?.description).toBe("A clockwork bird.\n\nIt sings when someone enters.");
    expect(d.recipe.dc).toBe(15);
    expect(d.recipe.requires_proficiency).toBe(true);
  });
});

describe("pricing and ceiling", () => {
  it("prices bare-number and 0.00 costs", () => {
    const d = draft(raw({ mechanics: [], recipe: { name: "R", description: "d", crafting_time: 2, crafting_time_unit: "hours", dc: 10 } }, { rarity: "mundane", value_cp: 500 }), ctx({ bench: [row("mundane", "12", 1, "a"), row("mundane", "0.00", 1, "b")] }));
    expect(d.ingredients.map((i) => i.value_cp)).toEqual([1200, 100]);
    expect(d.materials_value_cp).toBe(1300);
  });
  it("floors the ceiling at common from all-mundane materials", () => {
    const c = ctx({ bench: [row("mundane", "100 gp", 3)] });
    expect(draft(raw(), c).rarity_ceiling).toBe("common");
    expect(draft(raw({}, { rarity: "uncommon", value_cp: 20000 }), c).item.rarity).toBe("common");
  });
});

describe("rarity, budget and adjustments", () => {
  it("lowers a rare new item to uncommon, then fails the +2 bonus", () => {
    const c = ctx({ bench: [row("uncommon", "200 gp", 2)] });
    const r = raw({ mechanics: [{ kind: "attack_bonus", value: 2 }] }, { rarity: "rare", value_cp: 60000 });
    const e = errors(r, c);
    expect(e.join(" ")).toContain("at most +1");
    const ok = draft(raw({ mechanics: [{ kind: "attack_bonus", value: 1 }] }, { rarity: "rare", value_cp: 30000 }), c);
    expect(ok.item.rarity).toBe("uncommon");
    expect(ok.adjustments.join(" ")).toContain("Rarity lowered to uncommon");
  });
  it("rejects an existing candidate over the ceiling", () => {
    const c = ctx({ outputCandidates: [cand("o1", "Rare Gizmo", "rare")] });
    expect(errors({ ...raw(), output: { candidate_id: "o1" } }, c).join(" ")).toContain("rarer than these materials allow");
  });
  it("accepts an existing candidate and ignores the model's mechanics", () => {
    const c = ctx({ outputCandidates: [cand("o1", "Lantern", "common")] });
    const d = draft({ ...raw(), output: { candidate_id: "o1" } }, c);
    expect(d.item.ref).toEqual({ item_id: "id-o1" });
    expect(d.mechanics).toEqual([]);
  });
  it("checks an existing candidate by its facts", () => {
    const c = ctx({ outputCandidates: [cand("o1", "Odd", "common", { requires_attunement: true }), cand("o2", "Spelly", "common", { spell_count: 1 }), cand("o3", "Blade +2", "common")] });
    for (const k of ["o1", "o2", "o3"]) expect(errors({ ...raw(), output: { candidate_id: k } }, c).length).toBeGreaterThan(0);
  });
  it("refuses a lane violation and a mundane magic-only type", () => {
    expect(errors(raw({}, { item_type: "potion" }), ctx({ discipline: "smithing" })).join(" ")).toContain("cannot make");
    expect(errors(raw({ mechanics: [] }, { item_type: "ring", rarity: "mundane", value_cp: 100 }), ctx({ discipline: "jewelcrafting" })).join(" ")).toContain("cannot be mundane");
  });
  it("forces attunement off at common", () => {
    const d = draft(raw({}, { requires_attunement: true, attunement_requirements: "a bard" }), ctx());
    expect(d.item.new?.requires_attunement).toBe(false);
    expect(d.item.new?.attunement_requirements).toBeNull();
    expect(d.adjustments.join(" ")).toContain("Attunement removed");
  });
  it("reconciles charges from the mechanic", () => {
    const d = draft(raw({ mechanics: [{ kind: "charges", max: 2, recharge: "dawn" }, { kind: "minor", text: "Glows." }] }, { charges: 5 }), ctx());
    expect(d.item.new?.charges).toBe(2);
    expect(d.item.new?.recharge).toBe("dawn");
    expect(d.adjustments.join(" ")).toContain("Charges set to 2");
    const none = draft(raw({}, { charges: 3 }), ctx());
    expect(none.item.new?.charges).toBeNull();
  });
  it("rejects too many effects, unknown kinds and bad dice", () => {
    expect(errors(raw({ mechanics: [{ kind: "minor", text: "a" }, { kind: "minor", text: "b" }] }), ctx()).join(" ")).toContain("at most 1 effect");
    expect(errors(raw({ mechanics: [{ kind: "teleport" }] }), ctx()).join(" ")).toContain("unknown kind");
    expect(errors(raw({ mechanics: [{ kind: "healing", dice: "lots" }] }), ctx()).join(" ")).toContain("cannot be read");
  });
  it("checks base stats of a new item", () => {
    const c = ctx({ discipline: "smithing" });
    expect(errors(raw({ mechanics: [] }, { item_type: "weapon", damage_dice: "2d8", damage_type: "slashing" }), c).join(" ")).toContain("at most 12");
    expect(errors(raw({ mechanics: [] }, { item_type: "armor", armor_class: "19" }), c).join(" ")).toContain("at most 18");
    const ok = draft(raw({ mechanics: [] }, { item_type: "weapon", damage_dice: "1d8", damage_type: "slashing" }), c);
    expect(ok.item.new?.damage_rolls).toEqual([{ dice: "1d8", type: "slashing" }]);
  });
});

describe("value", () => {
  it("clamps into the band", () => {
    const d = draft(raw({}, { value_cp: 100 }), ctx());
    expect(d.item.value_cp).toBe(5000);
    expect(d.adjustments.join(" ")).toContain("Value set to 50 gp");
  });
  it("reduces quantity to fit the limit", () => {
    const d = draft(raw({ quantity: 5 }, { value_cp: 8000 }), ctx());
    expect(d.quantity).toBe(2);
    expect(d.adjustments.join(" ")).toContain("Quantity reduced to 2");
  });
  it("lowers the value of a single unit, or fails when under the band", () => {
    const d = draft(raw({}, { value_cp: 10000 }), ctx({ valueMultiple: 0.6 }));
    expect(d.item.value_cp).toBe(6000);
    expect(errors(raw(), ctx({ valueMultiple: 0.1 })).join(" ")).toContain("not worth enough for a common item");
  });
});

describe("recipe", () => {
  it("fixes magic dc and raises time to the floor", () => {
    const d = draft(raw({ recipe: { name: "R", description: "d", crafting_time: 2, crafting_time_unit: "hours", dc: 5 } }), ctx());
    expect(d.recipe.dc).toBe(15);
    expect(d.recipe.crafting_time).toBe(5);
    expect(d.recipe.crafting_time_unit).toBe("days");
    expect(d.adjustments.join(" ")).toContain("Crafting time raised");
  });
  it("keeps a mundane dc clamped to 8..15, default 10, no proficiency", () => {
    const m = (dc: unknown) => draft(raw({ mechanics: [], recipe: { name: "R", description: "d", crafting_time: 3, crafting_time_unit: "hours", dc } }, { rarity: "mundane", value_cp: 500 }), ctx());
    expect(m(12).recipe.dc).toBe(12);
    expect(m(12).recipe.requires_proficiency).toBe(false);
    expect(m(30).recipe.dc).toBe(15);
    expect(m(30).adjustments.join(" ")).toContain("Crafting DC set to 15");
    expect(m(undefined).recipe.dc).toBe(10);
    expect(m(2.5).recipe.dc).toBe(10);
  });
  it("takes proficiency from the model for mundane, forces it for magic, always needs tools", () => {
    const mundane = (extra: Record<string, unknown>) => draft(raw({ mechanics: [], recipe: { name: "R", description: "d", crafting_time: 3, crafting_time_unit: "hours", dc: 10, ...extra } }, { rarity: "mundane", value_cp: 500 }), ctx());
    expect(mundane({ requires_proficiency: true }).recipe.requires_proficiency).toBe(true);
    expect(mundane({}).recipe.requires_proficiency).toBe(false);
    expect(mundane({}).recipe.requires_tools).toBe(true);
    expect(draft(raw({ recipe: { name: "R", description: "d", crafting_time: 6, crafting_time_unit: "days", requires_proficiency: false } }), ctx()).recipe.requires_proficiency).toBe(true);
  });
  it("trims the special requirement and appends it to the description", () => {
    const r = draft(raw({ recipe: { name: "R", description: "Wind it.", crafting_time: 6, crafting_time_unit: "days", special_requirement: "  a forge heated by dragonfire  " } }), ctx()).recipe;
    expect(r.special_requirement).toBe("a forge heated by dragonfire");
    expect(r.description).toBe("Wind it.\nAlso needs: a forge heated by dragonfire.");
    const blank = draft(raw({ recipe: { name: "R", description: "Wind it.", crafting_time: 6, crafting_time_unit: "days", special_requirement: "   " } }), ctx()).recipe;
    expect(blank.special_requirement).toBeNull();
    expect(blank.description).toBe("Wind it.");
    const long = draft(raw({ recipe: { name: "R", description: "d", crafting_time: 6, crafting_time_unit: "days", special_requirement: "x".repeat(300) } }), ctx()).recipe;
    expect(long.special_requirement).toHaveLength(120);
  });
  it("rejects an empty recipe or item name and trims text", () => {
    expect(errors(raw({ recipe: { name: "  ", description: "d", crafting_time: 1, crafting_time_unit: "days" } }), ctx()).join(" ")).toContain("recipe name");
    expect(errors(raw({}, { name: " " }), ctx()).join(" ")).toContain("item name");
    expect(draft(raw({}, { name: "  Bird  " }), ctx()).item.name).toBe("Bird");
  });
});

describe("prefer what exists", () => {
  it("matches a new item to a candidate by name", () => {
    const c = ctx({ outputCandidates: [cand("o1", "singing bird", "common")] });
    const d = draft(raw(), c);
    expect(d.item.ref).toEqual({ item_id: "id-o1" });
    expect(d.adjustments).toContain("Matched to the existing singing bird.");
  });
});

describe("warnings", () => {
  it("warns on an undeclared +1 but not a declared one", () => {
    const c = ctx({ bench: [row("uncommon", "200 gp", 2)] });
    const undeclared = draft(raw({ mechanics: [{ kind: "minor", text: "x" }] }, { rarity: "uncommon", value_cp: 20000, rules_text: "Grants +1 to hit." }), c);
    expect(undeclared.warnings.join(" ")).toContain("+1");
    const declared = draft(raw({ mechanics: [{ kind: "attack_bonus", value: 1 }] }, { rarity: "uncommon", value_cp: 20000, rules_text: "Grants +1 to hit." }), c);
    expect(declared.warnings).toEqual([]);
  });
  it("warns about dice in flavor", () => {
    expect(draft(raw({}, { flavor: "Hits for 1d6." }), ctx()).warnings.join(" ")).toContain("game numbers");
  });
});

describe("ingredients", () => {
  it("ignores model ingredients in materials mode", () => {
    const d = draft(raw({ ingredients: [{ candidate_id: "nope", quantity: 3 }] }), ctx());
    expect(d.ingredients).toHaveLength(1);
    expect(d.ingredients[0].quantity).toBe(2);
  });
  it("idea mode uses candidates, merges duplicates, and rejects unknown ids", () => {
    const mc = [cand("m1", "Iron Ore", "common", { cost: "50 gp", item_type: "crafting_material" })];
    const c = ctx({ mode: "idea", bench: [], materialCandidates: mc });
    const d = draft(raw({ ingredients: [{ candidate_id: "m1", quantity: 1 }, { candidate_id: "m1", quantity: 1 }] }), c);
    expect(d.ingredients).toHaveLength(1);
    expect(d.ingredients[0].quantity).toBe(2);
    expect(errors(raw({ ingredients: [{ candidate_id: "m9", quantity: 1 }] }), c).join(" ")).toContain("not a listed material");
  });
  it("idea mode lets new materials set the ceiling, and rejects a third", () => {
    const nm = (name: string) => ({ new: { name, rarity: "uncommon", value_cp: 20000, description: "d" }, quantity: 1 });
    const c = ctx({ mode: "idea", bench: [] });
    const d = draft(raw({ ingredients: [nm("A"), nm("B")] }, { rarity: "uncommon", value_cp: 20000 }), c);
    expect(d.rarity_ceiling).toBe("uncommon");
    expect(d.ingredients[0].new?.cost).toBe("200 gp");
    expect(errors(raw({ ingredients: [nm("A"), nm("B"), nm("C")] }), c).join(" ")).toContain("At most 2 new materials");
  });
});

describe("nothing and malformed input", () => {
  it("allows nothing only in materials mode", () => {
    expect(validateInvention({ nothing: true, reason: "No." }, ctx())).toEqual({ kind: "nothing", reason: "No." });
    expect(validateInvention({ nothing: true, reason: "No." }, ctx({ mode: "idea" })).kind).toBe("invalid");
  });
  it("never throws on junk", () => {
    const c = ctx();
    for (const junk of [null, undefined, 5, "x", [], {}, { output: 3 }, { output: {}, recipe: 1 }, { output: { new: 4 }, quantity: "a" }, { output: { new: { name: 3 } }, mechanics: "x", recipe: {} }]) {
      const v = validateInvention(junk, c);
      expect(v.kind).toBe("invalid");
    }
    expect(validateInvention(raw({ mechanics: [null, 4, { kind: 3 }] }), c).kind).toBe("invalid");
    expect(validateInvention(raw({ recipe: { name: "R", description: "d", crafting_time: "soon", crafting_time_unit: "eons" } }), c).kind).toBe("invalid");
  });
});

describe("minor effects are rules too", () => {
  it("warns when a minor effect's text carries a bonus", () => {
    const d = draft(raw({ mechanics: [{ kind: "minor", text: "Grants +5 AC while it sings." }] }), ctx());
    expect(d.warnings.length).toBeGreaterThan(0);
  });
});
