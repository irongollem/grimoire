import { describe, expect, it } from "vitest";
import type { RunCombatant } from "../../../types/encounter.types.ts";
import type { MonsterStatBlock } from "../../../types/monster.types.ts";
import { emptyDefenses } from "../../../types/statBlock.types.ts";
import type { TurnOption, TurnOptionHeal } from "../terrain/options/types.ts";
import { chooseActionHeal, chooseBonusHeal, isLeveledCast, withoutLeveledCasts } from "./healChoice.ts";
import { pickTurn } from "./pick.ts";
import { tacticalProfile } from "./profile.ts";
import { stepsFor } from "./carryOut.ts";

const who = (id: string, over: Partial<RunCombatant> = {}): RunCombatant => ({
  instance_id: id, type: "monster", name: id[0].toUpperCase() + id.slice(1), faction_id: "m", initiative: null, hp: 20, max_hp: 20, ac: "12",
  conditions: [], curses: [], death_saves: { successes: 0, failures: 0 }, dex_mod: 0, position: { x: 0, y: 0 }, size: "medium", ...over,
});
const CLERIC = who("cleric");
const PIP_DOWN = who("pip", { type: "player", party_member_id: "pm-pip", hp: 0 });
const BRUG_LOW = who("brug", { hp: 6 });
const SCRATCH = who("sam", { hp: 18 });

function heal(over: Partial<TurnOptionHeal> & { targetIds: string[] }): TurnOption {
  const h: TurnOptionHeal = { name: "Cure Wounds", castLevel: 1, slot: "action", downIds: [], lowIds: [], spends: true, expectedEach: 7.5, distanceFeet: 5, ...over };
  return {
    id: `heal:${h.name}:${h.castLevel}:${h.targetIds.join("+")}`, kind: "heal", targetId: h.targetIds[0], destination: null, path: null, feet: null, attack: null, distanceFeet: null,
    provokes: [], exposure: [], summary: "heal", heal: h,
  };
}
const attack = (target: string): TurnOption => ({
  id: `attack:actions:Mace:${target}`, kind: "attack", targetId: target, destination: null, path: null, feet: null,
  attack: { list: "actions", action: "Mace", steps: null, distanceFeet: 5, cover: "none", longRange: false, closeCombat: false, hitChance: 0.7, expectedDamage: 6 },
  distanceFeet: null, provokes: [], exposure: [], summary: "attack",
});
const spell = (castLevel: number): TurnOption => ({
  id: `spell:Guiding Bolt:${castLevel}:foe`, kind: "spell", targetId: "foe", destination: null, path: null, feet: null, attack: null, distanceFeet: null, provokes: [], exposure: [], summary: "spell",
  spell: { name: "Guiding Bolt", castLevel, kind: "attack", targetIds: ["foe"], friendsCaught: [], spends: castLevel > 0, distanceFeet: 30, hitChance: 0.7, expectedDamage: 14 },
});

describe("chooseActionHeal", () => {
  // The maintainer's order: someone down first, then one below half. A scratch is never healed.
  // Bug caught: a heal at someone with a scratch while another friend is dying.
  it("fails if a heal at someone below half is chosen over one at someone who is down", () => {
    const low = heal({ targetIds: ["brug"], lowIds: ["brug"] });
    const down = heal({ targetIds: ["pip"], downIds: ["pip"] });
    expect(chooseActionHeal([low, down], [CLERIC, PIP_DOWN, BRUG_LOW])?.option).toBe(down);
  });

  it("fails if a heal at a scratch is chosen", () => {
    expect(chooseActionHeal([heal({ targetIds: ["sam"] })], [CLERIC, SCRATCH])).toBeNull();
  });

  // Several heals reach the same down friend: the cheaper slot wins (a level 1 slot is not wasted on what a level 1 slot does), and a heal that
  // reaches two who are down beats one that reaches one.
  it("fails if a bigger slot is spent where a smaller one heals the same, or one friend is healed when a spell reaches two down", () => {
    const small = heal({ targetIds: ["pip"], downIds: ["pip"], castLevel: 1 });
    const large = heal({ targetIds: ["pip"], downIds: ["pip"], castLevel: 3 });
    expect(chooseActionHeal([large, small], [CLERIC, PIP_DOWN])?.option).toBe(small);
    const two = heal({ name: "Mass Cure", targetIds: ["pip", "tess"], downIds: ["pip", "tess"], castLevel: 5 });
    const tess = who("tess", { type: "player", party_member_id: "pm-tess", hp: 0 });
    expect(chooseActionHeal([small, two], [CLERIC, PIP_DOWN, tess])?.option).toBe(two);
    // Even when the one-friend heal would restore more in all: who is down is counted before what is restored.
    const big = heal({ targetIds: ["pip"], downIds: ["pip"], expectedEach: 20 });
    const small2 = heal({ name: "Mass Cure", targetIds: ["pip", "tess"], downIds: ["pip", "tess"], expectedEach: 2 });
    expect(chooseActionHeal([big, small2], [CLERIC, PIP_DOWN, tess])?.option).toBe(small2);
  });

  // A Bonus Action heal is not an Action turn: chooseActionHeal never takes it.
  it("fails if a Bonus Action heal is chosen as the turn", () => {
    expect(chooseActionHeal([heal({ targetIds: ["pip"], downIds: ["pip"], slot: "bonus_action", name: "Healing Word" })], [CLERIC, PIP_DOWN])).toBeNull();
  });

  it("says who is down and what it spends", () => {
    const reason = chooseActionHeal([heal({ targetIds: ["pip"], downIds: ["pip"] })], [CLERIC, PIP_DOWN])?.reason;
    expect(reason).toBe("Casts Cure Wounds (level 1) to heal Pip: Pip is down at 0 hit points and spends a level 1 slot.");
  });
});

describe("chooseBonusHeal", () => {
  const word = (over: Partial<TurnOptionHeal> & { targetIds: string[] }) => heal({ name: "Healing Word", slot: "bonus_action", ...over });

  // Bug caught: a Bonus Action spent twice in a turn.
  it("fails if the Bonus Action is already used and the heal is still cast", () => {
    const options = [word({ targetIds: ["pip"], downIds: ["pip"] })];
    expect(chooseBonusHeal(options, [CLERIC, PIP_DOWN], who("cleric", { bonus_used: true }))).toBeNull();
    expect(chooseBonusHeal(options, [CLERIC, PIP_DOWN], CLERIC)).toMatchObject({ someoneDown: true });
  });

  // Bug caught: a heal at someone below half chosen over one at someone who is down, and the turn not told someone is down.
  it("fails if a Bonus Action heal at the one below half is chosen over one at the one who is down", () => {
    const low = word({ targetIds: ["brug"], lowIds: ["brug"], castLevel: 1 });
    const down = word({ targetIds: ["pip"], downIds: ["pip"], castLevel: 3 });
    expect(chooseBonusHeal([low, down], [CLERIC, BRUG_LOW, PIP_DOWN], CLERIC)).toMatchObject({ option: down, someoneDown: true });
  });

  it("is for someone below half too, but says no one is down", () => {
    expect(chooseBonusHeal([word({ targetIds: ["brug"], lowIds: ["brug"] })], [CLERIC, BRUG_LOW], CLERIC)).toMatchObject({ someoneDown: false });
  });

  it("fails if a Bonus Action heal is chosen for a scratch, or an Action heal is chosen as the Bonus Action one", () => {
    expect(chooseBonusHeal([word({ targetIds: ["sam"] }), heal({ targetIds: ["pip"], downIds: ["pip"] })], [CLERIC, SCRATCH, PIP_DOWN], CLERIC)).toBeNull();
  });
});

// PHB 2014 ch. 10 "Casting a Spell", Bonus Action: a creature that casts a spell as a Bonus Action casts no other spell that turn except a cantrip of one action.
describe("withoutLeveledCasts", () => {
  it("fails if a leveled cast stays beside a Bonus Action spell, or a cantrip is dropped", () => {
    const left = withoutLeveledCasts([attack("foe"), spell(0), spell(3), heal({ targetIds: ["pip"], downIds: ["pip"] })]);
    expect(left.map((o) => o.id)).toEqual(["attack:actions:Mace:foe", "spell:Guiding Bolt:0:foe"]);
    expect(isLeveledCast(spell(3))).toBe(true);
    expect(isLeveledCast(spell(0))).toBe(false);
  });

  // With nothing else to do, the creature is not left with no turn.
  it("fails if leaving out the leveled casts leaves no turn at all", () => {
    expect(withoutLeveledCasts([spell(3)])).toHaveLength(1);
  });
});

describe("pickTurn with a heal on offer", () => {
  const block = (): MonsterStatBlock => ({
    armor_class: 12, hit_points: "2d8", speed: "30 ft.", str: 10, dex: 10, con: 10, int: 10, wis: 14, cha: 10, challenge_rating: "1", defenses: emptyDefenses(),
  });
  const profile = tacticalProfile(block(), "humanoid");
  const ctx = (combatants: RunCombatant[]) => ({ combatants, moverId: "cleric", armorClassOf: () => 12 });
  const foe = who("foe", { faction_id: "p" });

  // Bug caught: a cleric that swings its mace while a friend lies dying at 0 hit points.
  it("fails if a creature attacks while a friend on its side is down", () => {
    const options = [attack("foe"), heal({ targetIds: ["pip"], downIds: ["pip"] })];
    const pick = pickTurn(options, profile, ctx([CLERIC, foe, PIP_DOWN]));
    expect(pick?.optionId).toBe("heal:Cure Wounds:1:pip");
  });

  // Bug caught: a scratch pulling the cleric off the fight.
  it("fails if a creature heals a scratch instead of attacking", () => {
    const options = [attack("foe"), heal({ targetIds: ["sam"] })];
    expect(pickTurn(options, profile, ctx([CLERIC, foe, SCRATCH]))?.optionId).toBe("attack:actions:Mace:foe");
  });

  // A Bonus Action heal alone is no turn: there is nothing for the picker to return. Bug caught: Healing Word returned as "the only turn on offer", leaving the Action unused.
  it("fails if a Bonus Action heal that is the only option is returned as the turn", () => {
    expect(pickTurn([heal({ targetIds: ["pip"], downIds: ["pip"], slot: "bonus_action", name: "Healing Word" })], profile, ctx([CLERIC, PIP_DOWN]))).toBeNull();
  });

  // A Bonus Action heal is never the turn the picker returns, even when it is all there is but a heal.
  it("fails if a Bonus Action heal is returned as a turn of its own", () => {
    const options = [attack("foe"), heal({ targetIds: ["pip"], downIds: ["pip"], slot: "bonus_action", name: "Healing Word" })];
    expect(pickTurn(options, profile, ctx([CLERIC, foe, PIP_DOWN]))?.optionId).toBe("attack:actions:Mace:foe");
  });
});

describe("stepsFor a heal", () => {
  // Bug caught: the cast step not saying it is a heal, so the server drops a target who is down (0 hit points) as "already dead".
  it("fails if the cast step is not marked as a heal and does not name every target", () => {
    expect(stepsFor(heal({ targetIds: ["pip", "tess"] }), [])).toEqual([{ type: "cast", spell: "Cure Wounds", castLevel: 1, targetIds: ["pip", "tess"], heal: true }]);
  });
});
