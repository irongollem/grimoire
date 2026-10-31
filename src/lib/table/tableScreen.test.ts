import { describe, expect, it } from "vitest";
import type { RunCombatant } from "@/types/encounter.types";
import { partyCentre, siteFogMask, tableOnMap, tableOrder, tableTurn, tableVisible, UNSEEN_NAME, type DisguisableNpc } from "./tableScreen";

function creature(over: Partial<RunCombatant> & Pick<RunCombatant, "instance_id" | "name">): RunCombatant {
  return {
    type: "monster", faction_id: "foes", initiative: 10, hp: 30, max_hp: 40, ac: "15",
    conditions: [{ name: "poisoned" }], curses: [], death_saves: { successes: 0, failures: 0 }, dex_mod: 0,
    reveal_state: "revealed", position: { x: 1, y: 1 }, ...over,
  };
}
const hero = (over: Partial<RunCombatant> = {}) => creature({ instance_id: "p-1", name: "Tamsin", type: "player", faction_id: "players", ...over });

// The rules below are what get_player_encounter_state applies for a player (#1125 decision 15: "in the players' eyes").
describe("tableVisible", () => {
  it("shows a revealed monster with no hit points, only whether it still stands", () => {
    const [ogre] = tableVisible([creature({ instance_id: "m1", name: "Ogre", hp: 12, max_hp: 59 })], []);
    expect([ogre.hp, ogre.max_hp, ogre.temp_hp, ogre.ac, ogre.conditions]).toEqual([1, 1, 0, "", []]);
  });

  it("keeps a fallen monster fallen, so its token is still drawn dead", () => {
    const [ogre] = tableVisible([creature({ instance_id: "m1", name: "Ogre", hp: 0 })], []);
    expect(ogre.hp).toBe(0);
  });

  it("leaves out a hidden monster, and one the DM never revealed (the default is hidden)", () => {
    const shown = tableVisible(
      [
        creature({ instance_id: "m1", name: "Lurker", reveal_state: "hidden" }),
        creature({ instance_id: "m2", name: "Unmarked", reveal_state: undefined }),
        hero(),
      ],
      [],
    );
    expect(shown.map((c) => c.name)).toEqual(["Tamsin"]);
  });

  it("names an unseen monster ??? and takes its face and identity away", () => {
    const [shadow] = tableVisible(
      [creature({ instance_id: "m1", name: "Ash-wight", reveal_state: "unseen", portrait_url: "https://x/wight.webp", token_url: "https://x/t.webp", monster_id: "mon-1" })],
      [],
    );
    expect([shadow.name, shadow.portrait_url, shadow.token_url, shadow.monster_id]).toEqual([UNSEEN_NAME, null, null, undefined]);
  });

  it("never touches a player's own hit points", () => {
    const [tamsin] = tableVisible([hero({ hp: 7, max_hp: 31 })], []);
    expect([tamsin.hp, tamsin.max_hp]).toEqual([7, 31]);
  });

  it("gives a concealed NPC its disguise name and face, and the true name once revealed", () => {
    const npc: DisguisableNpc = { id: "n1", disguise_name: "Old Tom", disguise_portrait_url: "https://x/tom.webp", disguise_portrait_focal_point: null, is_revealed: false };
    const spy = creature({ instance_id: "m1", name: "Vex the Spymaster", type: "monster", npc_id: "n1", token_url: "https://x/true.webp" });
    const [hidden] = tableVisible([spy], [npc]);
    expect([hidden.name, hidden.portrait_url, hidden.token_url]).toEqual(["Old Tom", "https://x/tom.webp", null]);
    const [open] = tableVisible([spy], [{ ...npc, is_revealed: true }]);
    expect(open.name).toBe("Vex the Spymaster");
  });
});

describe("tableOnMap", () => {
  // Frame 13: unrevealed squares are black. A monster standing in one is not drawn.
  it("drops a creature standing in a square the fog still covers", () => {
    const list = [creature({ instance_id: "m1", name: "Ogre", position: { x: 5, y: 5 } }), creature({ instance_id: "m2", name: "Imp", position: { x: 1, y: 1 } })];
    expect(tableOnMap(list, new Set(["1,1"])).map((c) => c.name)).toEqual(["Imp"]);
  });
});

describe("tableOrder and tableTurn", () => {
  it("lists the order by initiative, highest first", () => {
    const order = tableOrder([creature({ instance_id: "a", name: "Slow", initiative: 3 }), creature({ instance_id: "b", name: "Quick", initiative: 19 })]);
    expect(order.map((c) => c.name)).toEqual(["Quick", "Slow"]);
  });

  it("names whose turn it is, with the round", () => {
    expect(tableTurn(3, creature({ instance_id: "a", name: "Brakka" }))).toEqual({ eyebrow: "Round 3", title: "Brakka's turn" });
  });

  it("does not name an unseen creature when it is the one up", () => {
    const [shadow] = tableVisible([creature({ instance_id: "a", name: "Ash-wight", reveal_state: "unseen" })], []);
    expect(tableTurn(2, shadow).title).toBe("An unseen creature's turn");
  });

  it("names no one when the creature up is not one the table knows", () => {
    expect(tableTurn(1, null)).toEqual({ eyebrow: "Round 1", title: null });
  });
});

describe("siteFogMask", () => {
  it("lights explored rooms and keeps the rest black", () => {
    const mask = siteFogMask([["0,0", "1,0"]], []);
    expect([...mask].sort()).toEqual(["0,0", "1,0"]);
  });

  // A party in a corridor must not stand in the dark: a square of margin around every character is lit.
  it("lights a square of margin around each character, around the whole of a big one", () => {
    const mask = siteFogMask([], [{ position: { x: 10, y: 10 }, footprint: 2 }]);
    expect(mask.has("9,9")).toBe(true);
    expect(mask.has("12,12")).toBe(true);
    expect(mask.has("13,13")).toBe(false);
  });

  it("ignores a character with no square yet", () => {
    expect(siteFogMask([], [{ footprint: 1 }]).size).toBe(0);
  });
});

describe("partyCentre", () => {
  it("is the middle of the squares the party stands on", () => {
    expect(partyCentre([{ position: { x: 2, y: 4 } }, { position: { x: 4, y: 6 } }, {}])).toEqual({ x: 3, y: 5 });
  });
  it("is nowhere while nobody has a square", () => {
    expect(partyCentre([{}])).toBeNull();
  });
});
