import { describe, expect, it } from "vitest";
import type { RunCombatant } from "../../../types/encounter.types.ts";
import type { TurnOption, TurnOptionBoon } from "../terrain/options/types.ts";
import { boonRidesTurn, chooseActionBoon, chooseBonusBoon, isBoonOption } from "./boonChoice.ts";

const who = (id: string, over: Partial<RunCombatant> = {}): RunCombatant => ({
  instance_id: id, type: "monster", name: id[0].toUpperCase() + id.slice(1), faction_id: "m", initiative: null, hp: 20, max_hp: 20, ac: "12",
  conditions: [], curses: [], death_saves: { successes: 0, failures: 0 }, dex_mod: 0, position: { x: 0, y: 0 }, size: "medium", ...over,
});
const CLERIC = who("cleric");
const ROSTER = [CLERIC, who("pip"), who("brug"), who("tam")];

function boon(over: Partial<TurnOptionBoon> = {}): TurnOption {
  const b: TurnOptionBoon = { name: "Bless", castLevel: 1, slot: "action", targetIds: ["pip", "brug", "tam"], spends: true, distanceFeet: 5, targetCount: 3, concentration: true, ...over };
  return {
    id: `boon:${b.name}:${b.castLevel}`, kind: "boon", targetId: b.targetIds[0], destination: null, path: null, feet: null, attack: null, distanceFeet: null,
    provokes: [], exposure: [], summary: "boon", boon: b,
  };
}
const shield = (over: Partial<TurnOptionBoon> = {}) => boon({ name: "Shield of Faith", slot: "bonus_action", targetIds: ["pip"], targetCount: 1, ...over });

describe("chooseActionBoon", () => {
  // APP CONVENTION "cast early": round 1 and 2 cast Bless, round 3 does not. Bug caught: a boon cast in the fight's last rounds (or never).
  it("fails if Bless is not cast in round 2 or is cast in round 3", () => {
    const options = [boon()];
    expect(chooseActionBoon(options, ROSTER, CLERIC, 1)?.option).toBe(options[0]);
    expect(chooseActionBoon(options, ROSTER, CLERIC, 2)?.option).toBe(options[0]);
    expect(chooseActionBoon(options, ROSTER, CLERIC, 3)).toBeNull();
  });

  // With no round named nothing is known to be early. Bug caught: a missing round read as round 0, so the boon is cast every turn.
  it("fails if a boon is cast when the round is not given", () => {
    expect(chooseActionBoon([boon()], ROSTER, CLERIC, undefined)).toBeNull();
  });

  // PHB 2014 ch. 10 "Concentration": a new concentration spell ends the old one. Held on the creature itself, or as the source of a condition on someone else.
  // Bug caught: Bless cast over the caster's own Hold Person, ending it.
  it("fails if a concentration boon is cast while the caster already concentrates, by either mark", () => {
    const marked = who("cleric", { concentration: { spellId: null, spellName: "Hold Person", castAtLevel: 2, startedRound: 1, appliedEffectIds: [] } });
    expect(chooseActionBoon([boon()], [marked, ...ROSTER.slice(1)], marked, 1)).toBeNull();
    const holding = [CLERIC, who("pip", { conditions: [{ name: "Held", source: { id: "cleric", spell: "Hold Person", concentration: true } }] }), ...ROSTER.slice(2)];
    expect(chooseActionBoon([boon()], holding, CLERIC, 1)).toBeNull();
  });

  // The concentration rule is about concentration boons only: a boon that is not held by concentrating is cast over a held spell. Bug caught: every boon refused while concentrating.
  it("fails if a boon that needs no concentration is refused while the caster concentrates", () => {
    const marked = who("cleric", { concentration: { spellId: null, spellName: "Hold Person", castAtLevel: 2, startedRound: 1, appliedEffectIds: [] } });
    const plain = boon({ concentration: false });
    expect(chooseActionBoon([plain], [marked, ...ROSTER.slice(1)], marked, 1)?.option).toBe(plain);
  });

  // APP CONVENTION: an Action boon reaches at least two creatures (here a count of 3 reaches only one). Bug caught: the turn's Action spent to bless one creature.
  it("fails if an Action boon that reaches only one creature is cast", () => {
    expect(chooseActionBoon([boon({ targetIds: ["pip"] })], ROSTER, CLERIC, 1)).toBeNull();
    expect(chooseActionBoon([boon({ targetIds: ["pip", "brug"] })], ROSTER, CLERIC, 1)).not.toBeNull();
  });

  // A spell whose whole count is one creature reaches that one: min(2, count). Bug caught: a flat minimum of two refusing a one-creature spell cast as an Action.
  it("fails if an Action boon whose count is one is refused for reaching one", () => {
    const solo = boon({ name: "Aegis", targetIds: ["pip"], targetCount: 1 });
    expect(chooseActionBoon([solo], ROSTER, CLERIC, 1)?.option).toBe(solo);
  });

  // APP CONVENTION: the most targets, then the lower slot. Bug caught: list order, or the dearer slot.
  it("fails if the boon reaching fewer creatures, or at a higher slot, is preferred", () => {
    const two = boon({ targetIds: ["pip", "brug"] });
    const three = boon({ targetIds: ["pip", "brug", "tam"], castLevel: 2, targetCount: 4 });
    expect(chooseActionBoon([two, three], ROSTER, CLERIC, 1)?.option).toBe(three);
    const lower = boon({ castLevel: 1 });
    const higher = boon({ castLevel: 2, targetCount: 4 });
    expect(chooseActionBoon([higher, lower], ROSTER, CLERIC, 1)?.option).toBe(lower);
  });

  // A Bonus Action boon is no Action turn. Bug caught: Shield of Faith picked as the turn's Action.
  it("fails if a Bonus Action boon is chosen as the Action", () => {
    expect(chooseActionBoon([shield()], ROSTER, CLERIC, 1)).toBeNull();
  });
});

describe("chooseBonusBoon", () => {
  // A Bonus Action boon needs one creature, not two. Bug caught: the Action's minimum applied, so Shield of Faith is never cast.
  it("fails if a Bonus Action boon on one creature is not chosen", () => {
    const s = shield();
    expect(chooseBonusBoon([s], ROSTER, CLERIC, 1)?.option).toBe(s);
  });

  // The Bonus Action must be free. Bug caught: a second Bonus Action spent in one turn.
  it("fails if a Bonus Action boon is chosen with the Bonus Action spent", () => {
    expect(chooseBonusBoon([shield()], ROSTER, who("cleric", { bonus_used: true }), 1)).toBeNull();
  });

  // Same early and concentration rules as the Action boon. Bug caught: Shield of Faith cast in round 4, or over a held spell.
  it("fails if a Bonus Action concentration boon ignores the round or the held concentration", () => {
    expect(chooseBonusBoon([shield()], ROSTER, CLERIC, 3)).toBeNull();
    const marked = who("cleric", { concentration: { spellId: null, spellName: "Bless", castAtLevel: 1, startedRound: 1, appliedEffectIds: [] } });
    expect(chooseBonusBoon([shield()], [marked, ...ROSTER.slice(1)], marked, 1)).toBeNull();
  });

  // An Action boon is not what rides. Bug caught: Bless riding another turn as a Bonus Action.
  it("fails if an Action boon is chosen as the Bonus Action", () => {
    expect(chooseBonusBoon([boon()], ROSTER, CLERIC, 1)).toBeNull();
  });
});

describe("boonRidesTurn", () => {
  const swing: TurnOption = {
    id: "attack:actions:Mace:foe", kind: "attack", targetId: "foe", destination: null, path: null, feet: null, distanceFeet: null, provokes: [], exposure: [], summary: "attack",
    attack: { list: "actions", action: "Mace", steps: null, distanceFeet: 5, cover: "none", longRange: false, closeCombat: false, hitChance: 0.7, expectedDamage: 6 },
  };
  const cast = (castLevel: number): TurnOption => ({
    id: `spell:Guiding Bolt:${castLevel}:foe`, kind: "spell", targetId: "foe", destination: null, path: null, feet: null, attack: null, distanceFeet: null, provokes: [], exposure: [], summary: "spell",
    spell: { name: "Guiding Bolt", castLevel, kind: "attack", targetIds: ["foe"], friendsCaught: [], spends: castLevel > 0, distanceFeet: 30, hitChance: 0.7, expectedDamage: 14 },
  });
  const bonusBoon = shield();
  if (!isBoonOption(bonusBoon)) throw new Error("fixture");

  // PHB 2014 ch. 10 "Bonus Action" spells: a Bonus Action spell and a leveled spell do not share a turn; a cantrip may. Bug caught: Shield of Faith beside Guiding Bolt.
  it("fails if a Bonus Action boon rides a leveled cast, or does not ride an attack or a cantrip", () => {
    expect(boonRidesTurn(bonusBoon, swing)).toBe(true);
    expect(boonRidesTurn(bonusBoon, cast(0))).toBe(true);
    expect(boonRidesTurn(bonusBoon, cast(1))).toBe(false);
  });

  // A leveled Action boon (Bless) is a leveled cast too. Bug caught: Bless and Shield of Faith in one turn.
  it("fails if a Bonus Action boon rides a turn that is a leveled Action boon", () => {
    expect(boonRidesTurn(bonusBoon, boon())).toBe(false);
  });

  // APP CONVENTION: a concentration boon does not ride a turn that is itself a concentration boon (they would end each other); a cantrip boon is no leveled cast, so only this stops it.
  // Bug caught: two concentration spells in one turn, the first ended by the second.
  it("fails if a concentration Bonus Action boon rides a concentration boon cast at level 0", () => {
    expect(boonRidesTurn(bonusBoon, boon({ castLevel: 0 }))).toBe(false);
    expect(boonRidesTurn(bonusBoon, boon({ castLevel: 0, concentration: false }))).toBe(true);
  });

  // A swing from the Bonus Actions list spends the Bonus Action. Bug caught: a boon and an offhand swing both taking the one Bonus Action.
  it("fails if a Bonus Action boon rides an attack that is itself a Bonus Action", () => {
    const offhand: TurnOption = { ...swing, attack: { ...(swing.attack as NonNullable<TurnOption["attack"]>), list: "bonus_actions" } };
    expect(boonRidesTurn(bonusBoon, offhand)).toBe(false);
  });
});
