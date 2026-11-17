import { describe, expect, it } from "vitest";
import { encounterLootRows, lootIsWon, MAX_LOOT_ROWS } from "./encounterLoot.ts";
import type { FightState } from "./fight.ts";

const ITEM = "11111111-2222-4333-8444-555555555555";

describe("encounterLootRows", () => {
  // Bug caught: an item listed twice on an encounter laid down as two rows of one (or as one of one), and a shared
  // library item (its id is text, not a uuid) written to the uuid column, which the database refuses for the lot.
  it("counts an item named twice as two of it, and tells a campaign item from a library one", () => {
    expect(encounterLootRows([ITEM, "srd_potion-of-healing", ITEM], [])).toEqual([
      { kind: "item", item_id: ITEM, library_item_id: null, quantity: 2, label: "", payload: {} },
      { kind: "item", item_id: null, library_item_id: "srd_potion-of-healing", quantity: 1, label: "", payload: {} },
    ]);
  });

  // Bug caught: an empty purse laid in the room ("a purse of nothing"), or a negative or fractional count of coins
  // reaching the character's purse.
  it("lays a purse only for the coins that are really in it", () => {
    const pools = [
      { id: "a", label: " The captain's purse ", coins: { gp: 12, sp: 0, cp: -3, ep: 1.5 } },
      { id: "b", label: "Empty", coins: { gp: 0 } },
      { id: "c", label: "No coins" },
      "nonsense",
    ];
    expect(encounterLootRows([], pools)).toEqual([{ kind: "currency", item_id: null, library_item_id: null, quantity: 1, label: "The captain's purse", payload: { coins: { gp: 12 } } }]);
  });

  // Bug caught: loot notes that are not lists (null on an old row) throwing, which would cost the turn.
  it("comes to nothing for notes that are not lists, and stops at a sane number of rows", () => {
    expect(encounterLootRows(null, undefined)).toEqual([]);
    expect(encounterLootRows(Array.from({ length: 60 }, (_, i) => `lib_${i}`), [])).toHaveLength(MAX_LOOT_ROWS);
  });
});

describe("lootIsWon", () => {
  const fight = (phase: FightState["phase"], foeHp: number[]): FightState => ({
    encounterId: "e",
    name: "The Watching Pack",
    phase,
    round: 3,
    fighters: [{ name: "Rosie", side: "party", hp: 4, maxHp: 15 }, ...foeHp.map((hp, i) => ({ name: `Hound ${i + 1}`, side: "enemy" as const, hp, maxHp: 9 }))],
  });

  // Bug caught: the loot of a fight the party lost or is still fighting lying at their feet.
  it.each([
    ["every foe is down and the fight is over", fight("over", [0, 0]), true],
    ["a foe still stands when it ends (the party fell)", fight("over", [0, 5]), false],
    ["the fight is still being fought, though every foe is down", fight("running", [0, 0]), false],
    ["there were no foes", fight("over", []), false],
    ["there is no fight", null, false],
  ])("%s", (_when, state, won) => {
    expect(lootIsWon(state)).toBe(won);
  });
});
