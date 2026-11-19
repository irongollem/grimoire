import { describe, expect, it } from "vitest";
import { endOfFightPatches } from "./fightEnd.ts";
import { combatant, pc } from "./fightTestKit.ts";

describe("endOfFightPatches", () => {
  it("fails if a character's patch carries a due flag, keeps a stale initiative, or drops curses and death saves", () => {
    const hero = pc("p", {
      hp: 3,
      initiative: 14,
      curses: ["Mark of the Hag"],
      death_saves: { successes: 2, failures: 1 },
      conditions: [{ name: "Poisoned", due: { save: true } }, { name: "Prone" }],
    });
    const result = endOfFightPatches({ combatants: [hero, combatant("m")], tokensAtEnd: [], exploreParty: null, siteId: null });
    expect(result.partyMembers).toEqual([
      {
        id: "pm-p",
        patch: {
          current_hp: 3,
          conditions: [{ name: "Poisoned" }, { name: "Prone" }],
          curses: ["Mark of the Hag"],
          current_initiative: null,
          death_save_successes: 2,
          death_save_failures: 1,
        },
      },
    ]);
  });

  it("fails if a companion is written like a party member, or a monster is written at all", () => {
    const comp = combatant("c-1", { type: "player", companion_id: "comp-1", hp: 6, conditions: [{ name: "Frightened", due: { damage: true } }] });
    const result = endOfFightPatches({ combatants: [comp, combatant("m")], tokensAtEnd: [], exploreParty: null, siteId: null });
    expect(result.partyMembers).toEqual([]);
    expect(result.companions).toEqual([{ id: "comp-1", patch: { current_hp: 6, conditions: [{ name: "Frightened" }] } }]);
  });

  it("fails if the party's squares come from the roster instead of the tokens at the end", () => {
    const rosterHero = pc("p");
    const token = pc("p", { position: { x: 4, y: 7 } });
    const result = endOfFightPatches({ combatants: [rosterHero], tokensAtEnd: [token], exploreParty: null, siteId: "site-1" });
    expect(result.exploreParty).toEqual({ site_id: "site-1", positions: { "pm-p": { x: 4, y: 7 } } });
    expect(endOfFightPatches({ combatants: [rosterHero], tokensAtEnd: [token], exploreParty: null, siteId: null }).exploreParty).toBeNull();
  });

  // Bug: the whole condition list was written back, so a Dodge stance and a "3 rounds" Frightened that only meant
  // something inside the fight stayed on the character sheet forever, with no turn left to expire them.
  it("fails if fight-only stances, turn-counted conditions or a fight caster's concentration condition outlive the fight", () => {
    const hero = pc("p", {
      conditions: [
        { name: "Dodging", ends: { kind: "turn", at: "start", of: "self" } },
        { name: "Disengaged" },
        { name: "Frightened", ends: { kind: "rounds", remaining: 3 } },
        { name: "Stunned", ends: { kind: "save", ability: "con", dc: 13, at: "end" } },
        { name: "Hasted", source: { id: "caster", spell: "Haste", concentration: true } },
        { name: "Poisoned" },
      ],
    });
    const result = endOfFightPatches({ combatants: [hero, combatant("caster")], tokensAtEnd: [], exploreParty: null, siteId: null });
    // Hand-worked: only the plain Poisoned has no turn edge, round count or fight source tied to it.
    expect(result.partyMembers[0].patch.conditions).toEqual([{ name: "Poisoned" }]);
  });

  it("keeps Exhaustion and a concentration condition whose caster is not in the fight", () => {
    const hero = pc("p", {
      conditions: [
        { name: "Exhaustion", level: 2 },
        { name: "Charmed", source: { id: "elsewhere", concentration: true } },
        { name: "Cursed", source: { id: "caster" } },
      ],
    });
    const result = endOfFightPatches({ combatants: [hero, combatant("caster")], tokensAtEnd: [], exploreParty: null, siteId: null });
    expect(result.partyMembers[0].patch.conditions).toEqual(hero.conditions);
  });

  it("applies the same to a companion", () => {
    const comp = combatant("c-1", { type: "player", companion_id: "comp-1", conditions: [{ name: "Dodging" }, { name: "Prone" }] });
    const result = endOfFightPatches({ combatants: [comp], tokensAtEnd: [], exploreParty: null, siteId: null });
    expect(result.companions[0].patch.conditions).toEqual([{ name: "Prone" }]);
  });
});
