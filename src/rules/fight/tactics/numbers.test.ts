import { describe, expect, it } from "vitest";
import type { RunCombatant } from "../../../types/encounter.types.ts";
import type { AppliedCondition } from "../../../types/condition.types.ts";
import type { RulesetKey } from "../../../types/ruleset.types.ts";
import type { AttackStructure, StatBlockEntry } from "../../../types/statBlock.types.ts";
import type { TurnOption, TurnOptionAttack, UsableAttack } from "../terrain/turnOptions.ts";
import { castableNow } from "../spells/castNow.ts";
import { fireball, fireBolt, mageBlock } from "../spells/spellTestKit.ts";
import { chanceOfNatural20, chanceToFail, chanceToHit, UNKNOWN_SAVE_FAIL_CHANCE, withNumbers, type NumbersContext } from "./numbers.ts";

function creature(id: string, over: Partial<RunCombatant> = {}): RunCombatant {
  return {
    instance_id: id,
    type: "monster",
    name: id,
    faction_id: id === "ogre" ? "m" : "p",
    initiative: null,
    hp: 20,
    max_hp: 20,
    ac: "15",
    conditions: [],
    curses: [],
    death_saves: { successes: 0, failures: 0 },
    dex_mod: 0,
    position: { x: 0, y: 0 },
    size: "medium",
    ...over,
  };
}
const cond = (name: string, level?: number): AppliedCondition => ({ name, ...(level === undefined ? {} : { level }) });

const attackEntry = (name: string, attack: Partial<AttackStructure>): UsableAttack => ({
  list: "actions",
  entry: { name, description: "", structured: { source: "manual", kind: "attack", attack: { delivery: "melee", bonus: 6, hit: [{ dice: "2d8+4", type: "bludgeoning" }], ...attack } } } as StatBlockEntry,
});
const CLUB = attackEntry("Greatclub", {});

function option(over: Partial<TurnOptionAttack> = {}, action = "Greatclub"): TurnOption {
  return {
    id: `attack:actions:${action}:fresco`,
    kind: "attack",
    targetId: "fresco",
    destination: null,
    path: null,
    feet: null,
    attack: { list: "actions", action, steps: null, distanceFeet: 5, cover: "none", longRange: false, closeCombat: false, hitChance: null, expectedDamage: null, ...over },
    distanceFeet: null,
    provokes: [],
    exposure: [],
    summary: "",
  };
}

function numbersOf(opt: TurnOption, over: { ac?: number | null; attacks?: UsableAttack[]; mover?: Partial<RunCombatant>; target?: Partial<RunCombatant>; ruleset?: RulesetKey } = {}) {
  const ac = over.ac === undefined ? 15 : over.ac;
  const ctx: NumbersContext = {
    attacks: over.attacks ?? [CLUB],
    combatants: [creature("ogre", over.mover), creature("fresco", over.target)],
    moverId: "ogre",
    armorClassOf: () => ac,
    ruleset: over.ruleset ?? "2014",
  };
  const out = withNumbers([opt], ctx)[0];
  return { hit: out.attack?.hitChance ?? null, damage: out.attack?.expectedDamage ?? null, out };
}

describe("chanceToHit (PHB 2014 ch. 9 'Rolling 1 or 20')", () => {
  it("counts the faces that reach the armor: +6 against AC 15 needs a 9, which is 9 to 19 (11 faces) plus the 20: 12 of 20", () => {
    expect(chanceToHit(6, 15, "normal")).toBeCloseTo(0.6, 10);
  });
  it("lets a natural 20 hit what the numbers cannot: -5 against AC 30 hits only on the 20, 1 in 20", () => {
    expect(chanceToHit(-5, 30, "normal")).toBeCloseTo(0.05, 10);
  });
  it("lets a natural 1 miss what the numbers cannot: +20 against AC 5 hits on 2 to 20, 19 of 20, never 20", () => {
    expect(chanceToHit(20, 5, "normal")).toBeCloseTo(0.95, 10);
  });
  it("takes the better of two dice with advantage, 1 - 0.4^2 = 0.84, and the worse with disadvantage, 0.6^2 = 0.36", () => {
    expect(chanceToHit(6, 15, "advantage")).toBeCloseTo(0.84, 10);
    expect(chanceToHit(6, 15, "disadvantage")).toBeCloseTo(0.36, 10);
  });
  it("puts a natural 20 at 0.05, 1 - 0.95^2 = 0.0975 with advantage and 0.0025 with disadvantage", () => {
    expect(chanceOfNatural20("normal")).toBeCloseTo(0.05, 10);
    expect(chanceOfNatural20("advantage")).toBeCloseTo(0.0975, 10);
    expect(chanceOfNatural20("disadvantage")).toBeCloseTo(0.0025, 10);
  });
});

describe("expected damage", () => {
  it("is the hit chance times the whole average plus the 20's chance times the dice alone (a crit rolls the dice twice)", () => {
    // +6 against AC 15: 0.60. 2d8+4 averages 9 + 4 = 13; the dice alone average 9. 0.60 x 13 + 0.05 x 9 = 7.8 + 0.45 = 8.25.
    // Without the critical term it would be 7.8; counting the flat bonus twice on a crit would be 8.7.
    const { hit, damage } = numbersOf(option());
    expect(hit).toBeCloseTo(0.6, 10);
    expect(damage).toBeCloseTo(8.25, 10);
  });

  it("adds a rider to the average, flat and dice alike, but doubles only dice on a crit", () => {
    // 2d8+4 (13, dice 9) plus 1d6 (3.5, dice 3.5): 16.5 whole, 12.5 dice. 0.60 x 16.5 + 0.05 x 12.5 = 9.9 + 0.625 = 10.525.
    const club = attackEntry("Greatclub", { hit: [{ dice: "2d8+4", type: "bludgeoning" }, { dice: "1d6", type: "fire" }] });
    expect(numbersOf(option(), { attacks: [club] }).damage).toBeCloseTo(10.525, 10);
  });

  it("counts a flat-only damage part as a hit's damage and never as a crit's doubled dice", () => {
    // "1" piercing: 0.60 x 1 + 0.05 x 0 = 0.6.
    const club = attackEntry("Greatclub", { hit: [{ dice: "1", type: "piercing" }] });
    expect(numbersOf(option(), { attacks: [club] }).damage).toBeCloseTo(0.6, 10);
  });

  it("leaves the damage unknown, but still gives the hit chance, when a damage part cannot be read", () => {
    const club = attackEntry("Greatclub", { hit: [{ dice: "lots", type: null }] });
    const { hit, damage } = numbersOf(option(), { attacks: [club] });
    expect(hit).toBeCloseTo(0.6, 10);
    expect(damage).toBeNull();
  });
});

describe("cover raises the armor class the attack must beat (PHB 2014 ch. 9 'Cover')", () => {
  it("half cover is +2: AC 17 needs an 11 with +6, faces 11 to 19 are 9, plus the 20: 10 of 20 = 0.50", () => {
    expect(numbersOf(option({ cover: "half" })).hit).toBeCloseTo(0.5, 10);
  });
  it("three-quarters cover is +5: AC 20 needs a 14 with +6, faces 14 to 19 are 6, plus the 20: 7 of 20 = 0.35", () => {
    expect(numbersOf(option({ cover: "three_quarters" })).hit).toBeCloseTo(0.35, 10);
  });
});

describe("the roll mode", () => {
  const bow = attackEntry("Bow", { delivery: "ranged", range: { normal: 80, long: 320 } });
  const bowOption = (over: Partial<TurnOptionAttack>) => option({ distanceFeet: 30, ...over }, "Bow");

  it("is disadvantage at long range: 0.6^2 = 0.36, and the 20 is 0.0025, so 0.36 x 13 + 0.0025 x 9 = 4.7025", () => {
    const { hit, damage } = numbersOf(bowOption({ longRange: true }), { attacks: [bow] });
    expect(hit).toBeCloseTo(0.36, 10);
    expect(damage).toBeCloseTo(4.7025, 10);
  });

  it("is disadvantage for a ranged attack with an enemy within 5 ft", () => {
    expect(numbersOf(bowOption({ closeCombat: true }), { attacks: [bow] }).hit).toBeCloseTo(0.36, 10);
  });

  it("is not disadvantage for a melee attack just because an enemy is near (close combat is a ranged rule)", () => {
    expect(numbersOf(option({ closeCombat: true })).hit).toBeCloseTo(0.6, 10);
  });

  it("reads close combat as 'an enemy within 5 ft' only for a ranged attack: a reach-10 melee attack on a Prone target 10 ft off is disadvantage (0.36), not advantage", () => {
    // Prone beyond 5 ft is disadvantage (SRD Prone); the enemy beside the attacker must not make it "within 5 ft" of the target.
    const glaive = attackEntry("Glaive", { reach: 10 });
    expect(numbersOf(option({ distanceFeet: 10, closeCombat: true }, "Glaive"), { attacks: [glaive], target: { conditions: [cond("Prone")] } }).hit).toBeCloseTo(0.36, 10);
  });

  it("does not count long range against a melee attack", () => {
    expect(numbersOf(option({ longRange: true })).hit).toBeCloseTo(0.6, 10);
  });

  it("is a straight roll when advantage and long range cancel: a Restrained target and a long shot give 0.6", () => {
    expect(numbersOf(bowOption({ longRange: true }), { attacks: [bow], target: { conditions: [cond("Restrained")] } }).hit).toBeCloseTo(0.6, 10);
  });

  it("is still just disadvantage, not worse, when two sources impose it: long range and a Prone target beyond 5 ft give 0.36", () => {
    expect(numbersOf(bowOption({ longRange: true }), { attacks: [bow], target: { conditions: [cond("Prone")] } }).hit).toBeCloseTo(0.36, 10);
  });

  it("is advantage against a Restrained target: 0.84 (the existing roll-mode rule, not a second one)", () => {
    expect(numbersOf(option(), { target: { conditions: [cond("Restrained")] } }).hit).toBeCloseTo(0.84, 10);
  });

  it("is advantage for a melee attack on a Prone target within 5 ft", () => {
    expect(numbersOf(option({ distanceFeet: 5 }), { target: { conditions: [cond("Prone")] } }).hit).toBeCloseTo(0.84, 10);
  });

  it("is disadvantage when the attacker is Poisoned: 0.36", () => {
    expect(numbersOf(option(), { mover: { conditions: [cond("Poisoned")] } }).hit).toBeCloseTo(0.36, 10);
  });

  it("throws a melee-or-ranged attack when the target is beyond its reach, so it suffers the ranged rules", () => {
    // Reach 5 ft; the target is 30 ft off, so it is thrown, and an enemy beside the thrower gives disadvantage: 0.36.
    // At 5 ft it is a melee attack and the same enemy changes nothing: 0.6.
    const spear = attackEntry("Spear", { delivery: "melee_or_ranged", reach: 5, range: { normal: 20, long: 60 } });
    expect(numbersOf(option({ distanceFeet: 30, closeCombat: true }, "Spear"), { attacks: [spear] }).hit).toBeCloseTo(0.36, 10);
    expect(numbersOf(option({ distanceFeet: 5, closeCombat: true }, "Spear"), { attacks: [spear] }).hit).toBeCloseTo(0.6, 10);
  });
});

describe("exhaustion", () => {
  it("costs a 2024 attacker 2 per level on the roll: level 2 is -4, so +2 against AC 15 needs a 13: 13 to 19 is 7, plus the 20: 8 of 20 = 0.40", () => {
    expect(numbersOf(option(), { mover: { conditions: [cond("Exhaustion", 2)] }, ruleset: "2024" }).hit).toBeCloseTo(0.4, 10);
  });
  it("costs a 2014 attacker nothing at level 2 (disadvantage starts at level 3)", () => {
    expect(numbersOf(option(), { mover: { conditions: [cond("Exhaustion", 2)] }, ruleset: "2014" }).hit).toBeCloseTo(0.6, 10);
  });
});

describe("a Multiattack", () => {
  const slam = attackEntry("Slam", { bonus: 3, hit: [{ dice: "1d6+2", type: "bludgeoning" }] });
  const multi = (steps: { action: string; count: number }[]): UsableAttack => ({
    list: "actions",
    entry: { name: "Multiattack", description: "", structured: { source: "manual", kind: "multiattack", multiattack: steps } } as StatBlockEntry,
  });
  const steps = [{ action: "Greatclub", count: 2 }, { action: "Slam", count: 1 }];

  it("sums its steps, each times its count, and averages the hit chance over the swings", () => {
    // Greatclub +6 against AC 15: 0.60, expected 8.25, twice = 16.5. Slam +3: need 12, faces 12 to 19 are 8, plus the 20: 9 of 20 = 0.45;
    // 1d6+2 averages 5.5, dice alone 3.5: 0.45 x 5.5 + 0.05 x 3.5 = 2.475 + 0.175 = 2.65. Total 19.15.
    // Hit chance: (2 x 0.60 + 0.45) / 3 = 0.55. A sum that forgot the count would give 10.9; one that kept only the first step, 8.25.
    const { hit, damage } = numbersOf(option({ action: "Multiattack", steps }, "Multiattack"), { attacks: [multi(steps), CLUB, slam] });
    expect(damage).toBeCloseTo(19.15, 10);
    expect(hit).toBeCloseTo(0.55, 10);
  });

  it("leaves the option untouched when a step names nothing the mover has", () => {
    const { out } = numbersOf(option({ action: "Multiattack", steps }, "Multiattack"), { attacks: [multi(steps), CLUB] });
    expect(out.attack?.hitChance).toBeNull();
    expect(out.attack?.expectedDamage).toBeNull();
  });
});

describe("what it leaves alone", () => {
  it("gives no numbers when the target's armor class is unknown", () => {
    const { out } = numbersOf(option(), { ac: null });
    expect(out.attack?.hitChance).toBeNull();
    expect(out.attack?.expectedDamage).toBeNull();
  });

  it("passes a non-attack option through unchanged, and does not mutate the one it was given", () => {
    const dodge: TurnOption = { ...option(), id: "dodge", kind: "dodge", targetId: null, attack: null };
    const given = option();
    const ctx: NumbersContext = { attacks: [CLUB], combatants: [creature("ogre"), creature("fresco")], moverId: "ogre", armorClassOf: () => 15, ruleset: "2014" };
    const [a, b] = withNumbers([dodge, given], ctx);
    expect(a).toBe(dodge);
    expect(b.attack?.hitChance).toBeCloseTo(0.6, 10);
    expect(given.attack?.hitChance).toBeNull();
  });
});


describe("spell options (#1021)", () => {
  const mage = creature("ogre", { name: "Mage" });
  const SPELLS = castableNow(mageBlock(), mage, [fireball(), fireBolt()], "2014");
  const spellOption = (name: string, castLevel: number, kind: "attack" | "save", targetIds: string[]): TurnOption => ({
    id: `spell:${name}:${castLevel}:${targetIds[0]}`, kind: "spell", targetId: targetIds[0], destination: null, path: null, feet: null, attack: null, distanceFeet: null,
    provokes: [], exposure: [], summary: "",
    spell: { name, castLevel, kind, targetIds, friendsCaught: [], spends: castLevel > 0, distanceFeet: 20, hitChance: null, expectedDamage: null },
  });
  const run = (opt: TurnOption, over: { targets?: Record<string, Partial<RunCombatant>>; bonus?: number | null; ac?: number | null } = {}) => {
    const ids = Object.keys(over.targets === undefined ? { fresco: {} } : over.targets);
    const ctx: NumbersContext = {
      attacks: [],
      combatants: [mage, ...ids.map((id) => creature(id, over.targets === undefined ? {} : over.targets[id]))],
      moverId: "ogre",
      armorClassOf: () => (over.ac === undefined ? 15 : over.ac),
      ruleset: "2014",
      spells: SPELLS,
      saveBonusOf: () => (over.bonus === undefined ? 0 : over.bonus),
    };
    return withNumbers([opt], ctx)[0].spell;
  };

  // SRD 5.1 "Fireball": 8d6 averages 28; DC 14 against a +0 save fails on 13 of 20 faces: 0.65*28 + 0.35*14 = 23.1 per target.
  // Bug caught: the failure chance is the attack-roll one (a 20 always saving or a 1 always failing), or half damage is dropped.
  it("weighs a save spell by the chance each target fails: 3 targets of 0.65*28 + 0.35*14 = 23.1 make 69.3", () => {
    const spell = run(spellOption("Fireball", 3, "save", ["a", "b", "c"]), { targets: { a: {}, b: {}, c: {} } });
    expect(spell?.hitChance).toBeCloseTo(0.65, 10);
    expect(spell?.expectedDamage).toBeCloseTo(69.3, 10);
  });

  it("counts the failing chance of a save as faces that miss the DC: +0 against 14 fails 13 of 20, a +10 fails 3 of 20", () => {
    expect(chanceToFail(0, 14, "normal")).toBeCloseTo(0.65, 10);
    expect(chanceToFail(10, 14, "normal")).toBeCloseTo(0.15, 10);
    // A bonus that clears the DC on every face never fails, one that cannot reach it always does.
    expect(chanceToFail(20, 14, "normal")).toBe(0);
    expect(chanceToFail(-10, 14, "normal")).toBe(1);
  });

  // A target that has advantage on the save passes with 1 - 0.65^2 = 0.5775, so it fails 0.4225:
  // 0.4225*28 + 0.5775*14 = 19.915. A Dodging creature has advantage on DEX saves.
  // Bug caught: a target's advantage, or an automatic failure, is ignored when weighing the cast.
  it("applies the target's advantage on the save, and an automatic failure when it cannot save", () => {
    const dodging = run(spellOption("Fireball", 3, "save", ["a"]), { targets: { a: { conditions: [{ name: "Dodging" }] } } });
    expect(dodging?.expectedDamage).toBeCloseTo(19.915, 10);
    // Paralyzed fails STR and DEX saves automatically: the full 28.
    const paralyzed = run(spellOption("Fireball", 3, "save", ["a"]), { targets: { a: { conditions: [{ name: "Paralyzed" }] } } });
    expect(paralyzed?.hitChance).toBe(1);
    expect(paralyzed?.expectedDamage).toBeCloseTo(28, 10);
  });

  // APP CONVENTION: a save bonus that cannot be read (a character the server did not load) is a coin flip: 0.5*28 + 0.5*14 = 21.
  it("fails an unknown save half the time rather than guessing a bonus", () => {
    const spell = run(spellOption("Fireball", 3, "save", ["a"]), { targets: { a: {} }, bonus: null });
    expect(UNKNOWN_SAVE_FAIL_CHANCE).toBe(0.5);
    expect(spell?.expectedDamage).toBeCloseTo(21, 10);
  });

  // SRD 5.1 "Fire Bolt": 2d10 at 9th level averages 11, +6 against AC 15 needs a 9: 12 of 20 hit (0.6), the natural 20 rolls the
  // dice again (0.05*11): 0.6*11 + 0.05*11 = 7.15, with the attack code the attack options use.
  // Bug caught: an attack spell is weighed with the save arithmetic or its own copy of the to-hit maths.
  it("weighs an attack spell as an attack: 0.6 to hit, 7.15 expected", () => {
    const spell = run(spellOption("Fire Bolt", 0, "attack", ["a"]), { targets: { a: {} } });
    expect(spell?.hitChance).toBeCloseTo(0.6, 10);
    expect(spell?.expectedDamage).toBeCloseTo(7.15, 10);
  });

  // Bug caught: a target whose armor class is unknown still gets a made-up number, or a cast with no entry on hand is numbered.
  it("leaves the numbers null when an attack spell's target has no known armor class, or the cast is not castable", () => {
    expect(run(spellOption("Fire Bolt", 0, "attack", ["a"]), { targets: { a: {} }, ac: null })?.expectedDamage).toBeNull();
    expect(run(spellOption("Fireball", 9, "save", ["a"]), { targets: { a: {} } })?.expectedDamage).toBeNull();
  });
});
