import { describe, expect, it } from "vitest";
import type { CraftingInvention, InventionMechanic } from "@/types/crafting.types";
import {
  ingredientIsNew,
  inventionChatMessage,
  inventionMechanicLine,
  inventionStatusLabel,
  inventionValueText,
  outputIsNew,
  inventionRequirementLine,
  parseInvention,
  recipeDescriptionText,
} from "./invention";

function inventionRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "i1",
    campaign_id: "c1",
    party_member_id: "p1",
    user_id: "u1",
    discipline: "tinkering",
    mode: "idea",
    wish: "A clockwork bird that sings",
    bench: [],
    draft: {
      item: {
        ref: null,
        new: {
          name: "Songbird Automaton",
          item_type: "gear",
          subtype: null,
          rarity: "common",
          cost: "40 gp",
          value_cp: 4000,
          weight: 1,
          flavor: "A brass sparrow.",
          rules_text: "It sings when someone enters the room.",
          description: "A brass sparrow.\n\nIt sings when someone enters the room.",
          requires_attunement: false,
          attunement_requirements: null,
          charges: null,
          recharge: null,
          damage_rolls: null,
          armor_class: null,
          properties: [],
          tags: [],
        },
        name: "Songbird Automaton",
        rarity: "common",
        item_type: "gear",
        value_cp: 4000,
      },
      mechanics: [{ kind: "minor", text: "Sings when someone enters the room" }],
      quantity: 1,
      recipe: { name: "Songbird Automaton", description: "Wind it.", dc: 12, crafting_time: 5, crafting_time_unit: "days", requires_proficiency: false, requires_tools: true, special_requirement: null },
      ingredients: [
        { ref: { item_id: "x1" }, new: null, name: "Brass Gear", rarity: "common", value_cp: 5000, quantity: 2 },
      ],
      materials_value_cp: 10000,
      value_multiple: 2,
      value_limit_cp: 20000,
      rarity_ceiling: "common",
      adjustments: [],
      warnings: [],
    },
    revision: 1,
    status: "draft",
    dm_note: null,
    recipe_id: null,
    ai_provenance: { generatorType: "recipe_invention", provider: "x", model: "y", generatedAt: "now", edited: false },
    decided_by: null,
    decided_at: null,
    created_at: "2026-10-25T00:00:00Z",
    updated_at: "2026-10-25T00:00:00Z",
    ...over,
  };
}

function draftOf(row: Record<string, unknown>): Record<string, unknown> {
  return row.draft as Record<string, unknown>;
}

describe("parseInvention", () => {
  it("reads a well-formed row", () => {
    const parsed = parseInvention(inventionRow());
    expect(parsed.id).toBe("i1");
    expect(parsed.draft.item.name).toBe("Songbird Automaton");
  });

  it.each([null, "x", [], {}])("throws on %j", (bad) => {
    expect(() => parseInvention(bad)).toThrow(/Unexpected invention/);
  });

  type Break = (row: Record<string, unknown>) => void;
  const recipeOf = (row: Record<string, unknown>) => draftOf(row).recipe as Record<string, unknown>;
  const itemOf = (row: Record<string, unknown>) => draftOf(row).item as Record<string, unknown>;
  const withMechanic = (mechanic: Record<string, unknown>): Break => (row) => {
    draftOf(row).mechanics = [mechanic];
  };

  // Each case is one promise the table makes; breaking it must make the read fail loudly.
  const broken: [string, Break, RegExp][] = [
    ["a row with an unknown mode", (r) => { r.mode = "wish"; }, /mode/],
    ["a row with an unknown status", (r) => { r.status = "done"; }, /status/],
    ["a row whose bench is not a list", (r) => { r.bench = {}; }, /bench/],
    ["a row whose provenance is not an object", (r) => { r.ai_provenance = "x"; }, /ai_provenance/],
    ["a draft that is null", (r) => { r.draft = null; }, /draft/],
    ["a draft with no ingredients", (r) => { draftOf(r).ingredients = []; }, /ingredients/],
    ["a draft quantity of 0", (r) => { draftOf(r).quantity = 0; }, /quantity/],
    ["an unknown rarity ceiling", (r) => { draftOf(r).rarity_ceiling = "godly"; }, /rarity/],
    ["adjustments that are not a list of text", (r) => { draftOf(r).adjustments = [1]; }, /adjustments/],
    ["warnings that are not a list of text", (r) => { draftOf(r).warnings = "careful"; }, /warnings/],
    ["an output with both ref and new", (r) => { itemOf(r).ref = { item_id: "a" }; }, /exactly one/],
    ["an output with neither ref nor new", (r) => { itemOf(r).new = null; }, /exactly one/],
    ["a new output without rules text", (r) => { delete (itemOf(r).new as Record<string, unknown>).rules_text; }, /rules_text/],
    ["an output with an unknown item type", (r) => { itemOf(r).item_type = "gadget"; }, /item type/],
    ["an ingredient with an unknown rarity", (r) => { (draftOf(r).ingredients as Record<string, unknown>[])[0].rarity = "godly"; }, /rarity/],
    ["a recipe with an unknown time unit", (r) => { recipeOf(r).crafting_time_unit = "weeks"; }, /unit/],
    ["a recipe without requires_proficiency", (r) => { delete recipeOf(r).requires_proficiency; }, /requires_proficiency/],
    ["a recipe without requires_tools", (r) => { delete recipeOf(r).requires_tools; }, /requires_tools/],
    ["a recipe whose special requirement is a number", (r) => { recipeOf(r).special_requirement = 3; }, /special_requirement/],
    ["an unknown mechanic kind", withMechanic({ kind: "teleport" }), /unknown kind/],
    ["an attack bonus with no value", withMechanic({ kind: "attack_bonus" }), /value/],
    ["extra damage with no damage type", withMechanic({ kind: "extra_damage", dice: "1d4" }), /damage_type/],
    ["a spell with no level", withMechanic({ kind: "spell", name: "light" }), /level/],
    ["charges with no maximum", withMechanic({ kind: "charges", recharge: null }), /max/],
    ["an advantage with no subject", withMechanic({ kind: "advantage" }), /on is not text/],
    ...["id", "campaign_id", "party_member_id", "user_id", "discipline", "created_at", "updated_at"].map(
      (key): [string, Break, RegExp] => [`a row without ${key}`, (r) => { delete r[key]; }, new RegExp(key)],
    ),
  ];

  it.each(broken)("throws on %s", (_name, breakIt, message) => {
    const row = inventionRow();
    breakIt(row);
    expect(() => parseInvention(row)).toThrow(message);
  });
});

describe("inventionMechanicLine", () => {
  const cases: [InventionMechanic, string][] = [
    [{ kind: "minor", text: "Hums softly" }, "Hums softly"],
    [{ kind: "attack_bonus", value: 1 }, "+1 to attack and damage rolls"],
    [{ kind: "ac_bonus", value: 2 }, "+2 to Armor Class"],
    [{ kind: "save_bonus", value: 1 }, "+1 to saving throws"],
    [{ kind: "extra_damage", dice: "1d4", damage_type: "fire" }, "Extra 1d4 fire damage on a hit"],
    [{ kind: "healing", dice: "2d4+2" }, "Regains 2d4+2 hit points"],
    [{ kind: "spell", name: "light", level: 0 }, "Casts light (cantrip)"],
    [{ kind: "spell", name: "shield", level: 1 }, "Casts shield (1st level)"],
    [{ kind: "spell", name: "fireball", level: 3 }, "Casts fireball (3rd level)"],
    [{ kind: "spell", name: "x", level: 2 }, "Casts x (2nd level)"],
    [{ kind: "spell", name: "x", level: 5 }, "Casts x (5th level)"],
    [{ kind: "charges", max: 3, recharge: "at dawn" }, "3 charges, recharge: at dawn"],
    [{ kind: "charges", max: 2, recharge: null }, "2 charges"],
    [{ kind: "charges", max: 1, recharge: "at dawn" }, "1 charge, recharge: at dawn"],
    [{ kind: "resistance", damage_type: "cold" }, "Resistance to cold damage"],
    [{ kind: "advantage", on: "Perception checks to hear" }, "Advantage on Perception checks to hear"],
  ];
  it.each(cases)("%j", (m, line) => {
    expect(inventionMechanicLine(m)).toBe(line);
  });
});

describe("inventionValueText", () => {
  it("writes coins", () => {
    expect(inventionValueText(4000)).toBe("40 GP");
    expect(inventionValueText(5)).toBe("5 CP");
    expect(inventionValueText(1250)).toBe("12 GP 5 SP");
  });
  it("writes nothing as zero copper", () => {
    expect(inventionValueText(0)).toBe("0 CP");
    expect(inventionValueText(-50)).toBe("0 CP");
  });
});

describe("inventionStatusLabel", () => {
  it("speaks to the player", () => {
    expect(inventionStatusLabel("draft", "player")).toBe("Draft");
    expect(inventionStatusLabel("pending", "player")).toBe("With your DM");
    expect(inventionStatusLabel("approved", "player")).toBe("In your recipes");
  });
  it("speaks to the DM", () => {
    expect(inventionStatusLabel("pending", "dm")).toBe("Waiting for you");
    expect(inventionStatusLabel("draft", "dm")).toBe("Sent back");
    expect(inventionStatusLabel("approved", "dm")).toBe("Approved");
  });
});

describe("inventionChatMessage", () => {
  it("names who invented what", () => {
    expect(inventionChatMessage("Nessa", "Songbird Automaton")).toBe("🛠️ **Nessa** invented **Songbird Automaton**.");
  });
});

describe("newness helpers", () => {
  const inv: CraftingInvention = parseInvention(inventionRow());
  it("reads the output", () => {
    expect(outputIsNew(inv.draft)).toBe(true);
    expect(outputIsNew({ item: { ...inv.draft.item, new: null, ref: { item_id: "a" } } })).toBe(false);
  });
  it("reads an ingredient", () => {
    const [existing] = inv.draft.ingredients;
    expect(ingredientIsNew(existing)).toBe(false);
    expect(
      ingredientIsNew({
        ...existing,
        ref: null,
        new: { name: "Moon Dust", item_type: "crafting_material", rarity: "rare", cost: "5 gp", value_cp: 500, description: "", tags: [] },
      }),
    ).toBe(true);
  });
});


describe("inventionRequirementLine", () => {
  const base = { dc: 21, crafting_time: 50, crafting_time_unit: "days" as const, requires_proficiency: true, requires_tools: true };
  it("names the proficiency", () => {
    expect(inventionRequirementLine(base, "Mason's Tools")).toBe("DC 21, needs proficiency with Mason's Tools, 50 days");
  });
  it("names only the tool without proficiency", () => {
    expect(
      inventionRequirementLine({ ...base, dc: 12, crafting_time: 2, crafting_time_unit: "hours", requires_proficiency: false }, "Cook's Utensils"),
    ).toBe("DC 12, Cook's Utensils, 2 hours");
  });
});

describe("recipeDescriptionText", () => {
  it("drops a trailing Also needs line when a special requirement is set", () => {
    expect(recipeDescriptionText({ description: "Hammer it.\nAlso needs: taught by a runesmith.", special_requirement: "Taught by a runesmith" })).toBe("Hammer it.");
  });
  it("leaves the description alone otherwise", () => {
    expect(recipeDescriptionText({ description: "Hammer it.", special_requirement: null })).toBe("Hammer it.");
    expect(recipeDescriptionText({ description: "Also needs: x", special_requirement: null })).toBe("Also needs: x");
  });
});
