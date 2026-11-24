import { describe, expect, it } from "vitest";
import { askGenerator } from "@edge-shared/agent/askContract";
import { CR_LIST, TRAP_TYPES } from "@/types/trap.types";
import { PUZZLE_DIFFICULTIES, PUZZLE_TYPES } from "@/types/puzzle.types";
import { LOOT_CR_TIERS } from "@/types/lootTable.types";
import { ROLL_TABLE_GENERATOR_DICE } from "@/composables/dungeon-features/useGenerateRollTable";
import { ASK_LISTS } from "./askOptions";
import { formRows, pruneHidden } from "./askForm";

const CRAFT = ["trap", "puzzle", "dungeon_feature", "roll_table", "loot_table", "quest_hooks"] as const;
const generator = (id: string) => {
  const found = askGenerator(id);
  if (!found) throw new Error(`${id} exists`);
  return found;
};

describe("the Dungeon Craft and quest cards (#1270)", () => {
  // Bug caught: a generator whose button opens a card with no box to describe the thing in, so Create could never be pressed.
  it("opens each with a concept box worded for it, at the limit its panel had", () => {
    const limits = { trap: 1000, puzzle: 1000, dungeon_feature: 1000, roll_table: 500, loot_table: 500, quest_hooks: 500 };
    for (const id of CRAFT) {
      const concept = generator(id).concept;
      expect(concept?.max, id).toBe(limits[id]);
      expect(concept?.placeholder.length, id).toBeGreaterThan(20);
    }
  });

  // Bug caught: the quest hooks' theme required, where the panel let a DM ask with only a giver or a place.
  it("makes the quest hooks' theme optional and every other description required", () => {
    expect(generator("quest_hooks").concept?.required).toBeUndefined();
    for (const id of CRAFT.filter((c) => c !== "quest_hooks")) expect(generator(id).concept?.required, id).toBe(true);
  });

  // Bug caught: an input with no label, which the form would show as its key ("trap type") instead of the DM's word.
  it("labels every input", () => {
    for (const id of CRAFT) {
      for (const [key, schema] of Object.entries(generator(id).inputs)) expect(schema.label, `${id}.${key}`).toBeTruthy();
    }
  });

  // Bug caught: the panels opened with the picture on; a card that opened with it off would stop charging for art the DM expected.
  it("opens with the picture on wherever the generator paints one, and the page's die and tier chosen", () => {
    for (const id of ["trap", "puzzle", "dungeon_feature"]) expect(generator(id).opened, id).toEqual({ image: true });
    expect(generator("roll_table").opened).toEqual({ die: "1d8" });
    expect(generator("loot_table").opened).toEqual({ cr_tier: "5-10" });
  });

  // Bug caught: the model's pick lists drifting from the page's, so a chip the card offers was dropped by the adapter.
  it("offers the very words the pages' pickers do", () => {
    const enumOf = (id: string, key: string) => {
      const schema = generator(id).inputs[key];
      return schema?.type === "string" ? schema.enum : undefined;
    };
    expect(enumOf("trap", "trap_type")).toEqual(TRAP_TYPES.map((t) => t.toLowerCase()));
    expect(enumOf("puzzle", "puzzle_type")).toEqual(PUZZLE_TYPES.map((t) => t.toLowerCase()));
    expect(enumOf("puzzle", "difficulty")).toEqual(PUZZLE_DIFFICULTIES.map((t) => t.toLowerCase()));
    expect(enumOf("loot_table", "cr_tier")).toEqual([...LOOT_CR_TIERS]);
    expect(enumOf("roll_table", "die")).toEqual([...ROLL_TABLE_GENERATOR_DICE]);
    expect(ASK_LISTS.trap_cr().value.map((o) => o.value)).toEqual([...CR_LIST]);
  });

  // Bug caught: the party switch showing with no picture to put the party in, so it could be set and then ignored.
  it("shows the trap's party switch only while the illustration is on, and drops it when the illustration goes", () => {
    const trap = generator("trap");
    const keys = (inputs: Record<string, unknown>) => formRows(trap, inputs).flatMap((r) => (r.kind === "input" ? [r.key] : []));
    expect(keys({})).not.toContain("party_in_picture");
    expect(keys({ image: true })).toContain("party_in_picture");
    expect(pruneHidden(trap, { image: true, party_in_picture: true, cr: "1" })).toEqual({ image: true, party_in_picture: true, cr: "1" });
    expect(pruneHidden(trap, { party_in_picture: true, cr: "1" })).toEqual({ cr: "1" });
  });

  // Bug caught: the quest hooks card taking the giver and place as typed words, which the adapter would then drop as not ids.
  it("picks the quest giver and the place as records", () => {
    const { inputs } = generator("quest_hooks");
    expect(inputs.quest_giver_id).toMatchObject({ record: "npc" });
    expect(inputs.location_id).toMatchObject({ record: "location" });
  });
});
