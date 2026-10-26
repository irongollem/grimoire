import { describe, expect, it } from "vitest";
import {
  CRAFTING_DISCIPLINES as EDGE_DISCIPLINES,
  ITEM_RARITIES as EDGE_RARITIES,
  ITEM_TYPES as EDGE_TYPES,
  type CraftingDiscipline as EdgeDiscipline,
  type DamageRoll as EdgeDamageRoll,
  type ItemRarity as EdgeRarity,
  type ItemType as EdgeType,
} from "@edge-shared/invention/types.ts";
import { CRAFTING_DISCIPLINES } from "@/lib/crafting/disciplines";
import type { DamageRoll } from "@/lib/dice/dice";
import type { CraftingDiscipline } from "@/types/crafting.types";
import { ITEM_RARITIES, ITEM_TYPES, type ItemRarity, type ItemType } from "@/types/item.types";

// Edge code cannot import from src/, so the invention validator keeps its own copies of these.
// The client takes the Invention* draft types from the edge file, so a copy that drifted here
// would type every draft against the wrong enum.
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const typesMatch: [
  Equal<EdgeRarity, ItemRarity>,
  Equal<EdgeType, ItemType>,
  Equal<EdgeDiscipline, CraftingDiscipline>,
  Equal<EdgeDamageRoll, DamageRoll>,
] = [true, true, true, true];

describe("invention enum mirror", () => {
  it("the validator's enums equal the client's", () => {
    expect(typesMatch).toEqual([true, true, true, true]);
    expect([...EDGE_RARITIES]).toEqual([...ITEM_RARITIES]);
    expect([...EDGE_TYPES]).toEqual([...ITEM_TYPES]);
    expect([...EDGE_DISCIPLINES].sort()).toEqual(CRAFTING_DISCIPLINES.map((d) => d.id).sort());
  });
});
