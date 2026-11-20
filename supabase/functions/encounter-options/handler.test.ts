/**
 * The options function against an in-memory fight. Every expected value is worked out from the map drawn in the
 * comment above it: x to the right, y down, a Medium creature at (x,y) fills that one square, 5 ft a step.
 */
import { describe, expect, it } from "vitest";
import { combatant, pc } from "../../../src/rules/fight/fightTestKit";
import type { FightMapInput } from "../../../src/rules/fight/terrain/battleMap";
import type { GridCalibration } from "../../../src/types/location.types";
import type { Monster } from "../../../src/types/monster.types";
import type { PartyIngestRow } from "../../../src/rules/fight/partyIngest";
import type { RunCombatant } from "../../../src/types/encounter.types";
import type { CharacterClass } from "../../../src/types/multiclass.types";
import { NO_CASTING, type PlayerSheets } from "../../../src/rules/fight/playerSheet";
import { emptyDefenses, type StatBlockEntry } from "../../../src/types/statBlock.types";
import { meleeReachFeet } from "../_shared/turnOptionsFor";
import { computeOptions, OptionsError, validateOptionsRequest, type OptionsDeps, type OptionsFight } from "./handler";
import { fireBolt, fireball, holdPerson, holdPersonEffect, mageBlock, mageWithHold } from "../../../src/rules/fight/spells/spellTestKit";
import type { SpellRecord } from "../../../src/rules/fight/spells/spellChoice";

// A square picture, 10 across: cells 0 to 9 both ways. Its shape is recorded (`image_height_over_width`), so the map's edge is known.
const CALIBRATION = { cells_per_image_width: 10, origin_x_pct: 0, origin_y_pct: 0, origin_cell_x: 0, origin_cell_y: 0, image_height_over_width: 1 } as GridCalibration;
// A calibrated picture with nothing drawn on it: open ground.
const OPEN_GROUND: FightMapInput = {
  encounterLocation: {
    id: "field", location_type: "region", map_url: null, grid_calibration: null, map_layer_url: "field.png", map_layer_stand_url: null,
    map_layer_stand_live_url: null, map_layer_calibration: CALIBRATION, plan_size: null, map_live: null,
  },
  parent: null,
  regions: [],
  doorStates: [],
  seen: new Set(),
};

const attack = (name: string, extra: Record<string, unknown> = {}): StatBlockEntry => ({
  name,
  description: "",
  structured: { kind: "attack", source: "manual", attack: { delivery: "melee", bonus: 4, hit: [] }, ...extra },
});
const monster = (id: string, actions: StatBlockEntry[]): Monster =>
  ({ id, name: id, stat_block: { armor_class: 12, hit_points: "1d8", speed: "30 ft.", str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, challenge_rating: "1", defenses: emptyDefenses(), actions } }) as unknown as Monster;

const wolf = (over: Partial<RunCombatant> = {}) => combatant("wolf", { monster_id: "m-wolf", faction_id: "m", position: { x: 0, y: 0 }, size: "medium", ...over });
const hero = (x: number, y: number, over: Partial<RunCombatant> = {}) => pc("pc", { faction_id: "p", position: { x, y }, size: "medium", ...over });

interface Setup {
  combatants: RunCombatant[];
  monsters?: Monster[];
  speeds?: { id: string; speed: number }[];
  /** The players' own rows; none by default. */
  party?: PartyIngestRow[];
  map?: FightMapInput | null;
  /** What the server reads of the players' sheets; none by default (a player then has no stat block). */
  sheets?: PlayerSheets;
  version?: number;
  spells?: SpellRecord[];
  /** Every list of names the spell loader was asked for. */
  spellReads?: string[][];
}
function deps(s: Setup): OptionsDeps {
  const fight: OptionsFight = { version: s.version ?? 7, combatants: s.combatants, ruleset: "2014", factions: [], round: 1, live: true };
  return {
    loadFight: async () => fight,
    loadPartyRows: async () => structuredClone(s.party ?? []),
    loadStatBlocks: async () => ({ monsters: s.monsters ?? [monster("m-wolf", [attack("Bite")])], npcs: [], companions: [] }),
    loadMemberSpeeds: async () => s.speeds ?? [],
    loadPlayerSheets: async () => structuredClone(s.sheets ?? { members: [], inventory: [], items: [], beasts: [], casting: NO_CASTING }),
    loadMapInput: async () => (s.map === undefined ? OPEN_GROUND : s.map),
    loadSpellsListed: async (names) => {
      s.spellReads?.push(names);
      return s.spells ?? [];
    },
  };
}
const ask = (s: Setup, instanceId = "wolf") => computeOptions({ encounterId: "enc", instanceId }, deps(s));
const ids = (r: { options: { id: string }[] }) => r.options.map((o) => o.id);

describe("computeOptions", () => {
  it("offers the stat block's attack from the speed on the stat block, and names the row version it read", async () => {
    // Wolf (0,0) speed 30; the hero stands at (4,0). Squares beside the hero are x=3: 3 steps, 15 ft; the map's top row is y=0 (the square above it, (3,-1), is off the picture), so (3,0).
    const r = await ask({ combatants: [wolf(), hero(4, 0)], version: 7 });
    expect(r.version).toBe(7);
    const bite = r.options.find((o) => o.id === "attack:actions:Bite:pc");
    expect(bite?.feet).toBe(15);
    expect(bite?.destination).toEqual({ x: 3, y: 0 });
  });

  it("leaves out an ability that is spent: a used recharge", async () => {
    // Bite is free, Blast is Recharge 5-6 and has been used once. The hero is beside the wolf.
    const blast = attack("Blast", { recharge: { min: 5, max: 6 } });
    const monsters = [monster("m-wolf", [attack("Bite"), blast])];
    const spent = await ask({ combatants: [wolf({ action_uses: { "actions/Blast": { used: 1, recharge: { min: 5, max: 6 } } } }), hero(1, 0)], monsters });
    expect(ids(spent)).toContain("attack:actions:Bite:pc");
    expect(ids(spent)).not.toContain("attack:actions:Blast:pc");
    const fresh = await ask({ combatants: [wolf(), hero(1, 0)], monsters });
    expect(ids(fresh)).toContain("attack:actions:Blast:pc");
  });

  it("takes the feet already moved off the budget", async () => {
    // Hero at (5,0): beside it is x=4, 4 steps, 20 ft: in reach of a 30 ft budget, not of 30 - 25 = 5 ft. With 5 ft left
    // the wolf dashes (10 ft): two steps, ending 15 ft from the hero ((2,-2) is the top-row square with 2 steps).
    const r = await ask({ combatants: [wolf({ movement_used: 25 }), hero(5, 0)] });
    expect(ids(r)).not.toContain("attack:actions:Bite:pc");
    const dash = r.options.find((o) => o.id === "dash:pc");
    expect(dash?.feet).toBe(10);
    expect(dash?.distanceFeet).toBe(15);
  });

  it("gives a player Dodge and movement only, at the sheet's speed", async () => {
    // The hero (0,3) has speed 25 on the sheet; the wolf is at (3,3). No stat block, so no attack. A Dash (50 ft) reaches the
    // squares beside the wolf at x=2: 2 steps, 10 ft; the top row (2,2). A player is also offered Flee (the farthest square from the wolf).
    const r = await ask({ combatants: [hero(0, 3, { faction_id: "m" }), wolf({ faction_id: "p", position: { x: 3, y: 3 } })], speeds: [{ id: "pm-pc", speed: 25 }] }, "pc");
    expect(ids(r)).toEqual(["dash:wolf", "flee", "dodge"]);
    expect(r.options[0].feet).toBe(10);
  });

  it("reads an enemy's reach from its stat block, so a long-reach enemy can take an opportunity attack", async () => {
    // Wolf (0,0). The pike (reach 10 ft) stands at (0,2): one empty square between, 10 ft, inside its reach, so it
    // threatens the wolf and Disengage is offered. With the default 5 ft it would not.
    const pike = combatant("pike", { monster_id: "m-pike", faction_id: "p", position: { x: 0, y: 2 }, size: "medium" });
    const r = await ask({ combatants: [wolf(), pike], monsters: [monster("m-wolf", [attack("Bite")]), monster("m-pike", [attack("Pike", { attack: { delivery: "melee", bonus: 4, reach: 10, hit: [] } })])] });
    expect(ids(r)).toContain("disengage");
  });

  it("offers attacks with nothing measured when the encounter has no place", async () => {
    const r = await ask({ combatants: [wolf(), hero(4, 0)], map: null });
    expect(ids(r)).toEqual(["attack:actions:Bite:pc", "dodge"]);
    expect(r.options[0].destination).toBeNull();
  });

  // Bug caught: the list a DM is shown ("what could it do") leaving out the casts the creature's own turn takes.
  it("offers a caster's spells, read once by the names its stat block lists, and reads none for a creature with no spells", async () => {
    const mage = combatant("mage", { monster_id: "m-mage", faction_id: "m", position: { x: 0, y: 0 }, size: "medium" });
    const reads: string[][] = [];
    const r = await computeOptions({ encounterId: "enc", instanceId: "mage" }, deps({
      combatants: [mage, hero(4, 0)],
      monsters: [{ id: "m-mage", name: "Mage", stat_block: mageBlock() } as unknown as Monster],
      spells: [fireball(), fireBolt()],
      spellReads: reads,
    }));
    expect(r.options.some((o) => o.kind === "spell" && o.spell?.name === "Fireball")).toBe(true);
    expect(reads).toHaveLength(1);

    const none: string[][] = [];
    await ask({ combatants: [wolf(), hero(4, 0)], spellReads: none });
    expect(none).toEqual([]);
  });

  // Bug caught: Hold Person offered at a wolf, or at no one because the kinds are not read: the list must show it at the humanoid only.
  it("offers a kind-limited spell only at a hostile of a known, allowed kind, and a spell with no limit as before", async () => {
    const mage = combatant("mage", { monster_id: "m-mage", faction_id: "m", position: { x: 0, y: 0 }, size: "medium" });
    const typed = (id: string, monster_type: string) => ({ ...monster(id, [attack("Bite")]), monster_type }) as Monster;
    const hostile = (id: string, at: number) => combatant(id, { monster_id: `m-${id}`, faction_id: "p", position: { x: at, y: 0 }, size: "medium" });
    const r = await computeOptions({ encounterId: "enc", instanceId: "mage" }, deps({
      combatants: [mage, hostile("wolf", 2), hostile("bandit", 3)],
      monsters: [{ id: "m-mage", name: "Mage", stat_block: mageWithHold() } as unknown as Monster, typed("m-wolf", "beast"), typed("m-bandit", "humanoid")],
      spells: [holdPerson({ condition_effect: holdPersonEffect({ only_kinds: ["humanoid"] }) }), fireball()],
    }));
    const casts = r.options.flatMap((o) => (o.kind === "spell" && o.spell ? [[o.spell.name, o.spell.targetIds] as const] : []));
    expect(casts.filter(([name]) => name === "Hold Person")).toEqual([["Hold Person", ["bandit"]]]);
    expect(casts.some(([name]) => name === "Fireball")).toBe(true);
  });

  // The saved fight says the hero is at 20 hit points, but their own row (a hit that has not reached the fight yet) says 0: the
  // server ingests the row before it plays a turn, so the options must too. A creature at 0 is no living target, so the
  // wolf is offered no attack on the hero; with the row at 20 it is (the control). The fight as loaded is not changed.
  it("fails if the options are worked out on stale player hit points, offering an attack on a character the row says is down", async () => {
    const row = (hp: number): PartyIngestRow => ({
      id: "pm-pc", current_hp: hp, temp_hp: 0, current_initiative: null, conditions: [], concentration: null,
      wildshape_state: null, death_save_successes: 0, death_save_failures: 0,
    });
    const roster = () => [wolf(), hero(4, 0, { hp: 20, max_hp: 20 })];
    expect(ids(await ask({ combatants: roster(), party: [row(20)] }))).toContain("attack:actions:Bite:pc");
    const down = roster();
    expect(ids(await ask({ combatants: down, party: [row(0)] }))).not.toContain("attack:actions:Bite:pc");
    expect(down[1].hp).toBe(20);
  });

  it("refuses an encounter with no fight yet and a creature that is not in it", async () => {
    await expect(computeOptions({ encounterId: "enc", instanceId: "wolf" }, { ...deps({ combatants: [] }), loadFight: async () => null })).rejects.toMatchObject({ status: 404 });
    await expect(ask({ combatants: [wolf()] }, "ghost")).rejects.toMatchObject({ status: 404 });
  });
});

describe("meleeReachFeet", () => {
  const block = (...actions: StatBlockEntry[]) => monster("m", actions).stat_block;
  const withReach = (name: string, delivery: "melee" | "ranged" | "melee_or_ranged", reach?: number) =>
    attack(name, { attack: { delivery, bonus: 0, hit: [], ...(reach === undefined ? {} : { reach }) } });

  it("is the longest melee reach, ignoring ranged attacks", () => {
    expect(meleeReachFeet(block(withReach("Claw", "melee", 5), withReach("Whip", "melee", 15), withReach("Spit", "ranged", 30)))).toBe(15);
  });
  it("is 5 ft for a melee attack naming none, for no melee attack at all, and for no stat block", () => {
    expect(meleeReachFeet(block(withReach("Claw", "melee")))).toBe(5);
    expect(meleeReachFeet(block(withReach("Spit", "ranged", 30)))).toBe(5);
    expect(meleeReachFeet(null)).toBe(5);
  });
});

// An ally is listed the way `take_turn` plays them (#1021). Dex 16 is +3 and proficiency +2: Unarmed Strike is +5 for 1 + Str modifier
// (Str 10, so 1) damage. The sheet holds no weapon.
const SAM: PlayerSheets = {
  members: [{
    id: "pm-pc", ruleset: "2014", class: "Fighter", subclass: null, ac_formula: null, class_choices: {},
    str: 10, dex: 16, con: 12, int: 10, wis: 10, cha: 10, proficiency_bonus: 2, saving_throw_proficiencies: [], speed: 25, level: 1, custom_attacks: [], spell_slots: [],
    wildshape_state: null,
  }],
  inventory: [], items: [], beasts: [], casting: NO_CASTING,
};

describe("computeOptions for an ally", () => {
  // Bug caught: a party member the server plays listed with no attack (no stat block), so the DM's list disagreed with take_turn.
  it("fails if an ally with a sheet is not offered the attacks that sheet makes", async () => {
    const r = await ask({ combatants: [hero(0, 3, { faction_id: "m" }), wolf({ faction_id: "p", position: { x: 1, y: 3 } })], sheets: SAM, speeds: [{ id: "pm-pc", speed: 25 }] }, "pc");
    expect(ids(r)).toContain("attack:actions:Unarmed Strike:wolf");
  });

  // Bug caught: the DM's list for a caster ally leaving out its spells, or counting a cast the fight already tallied twice. Level 5 Wizard
  // (Int 16, proficiency 3): Fireball is DC 14. One of two 3rd-level slots is spent on the sheet and tallied by the fight: one is left.
  it("fails if a caster ally's list leaves out a spell it has a slot for, or counts a tallied cast twice", async () => {
    const wizard = { id: "cls-wiz", party_member_id: "pm-pc", class_name: "Wizard", class_definition_id: "def-wiz", class_definition_kind: "system", subclass_name: null, subclass_definition_id: null, subclass_variant: null, levels: 5, is_primary: true, hit_dice_used: 0, sort_order: 0, capabilities: [] } as unknown as CharacterClass;
    const sheets: PlayerSheets = {
      ...SAM,
      members: [{ ...SAM.members[0], int: 16, level: 5, proficiency_bonus: 3, spell_slots: [{ level: 3, max: 2, used: 1 }] }],
      casting: {
        spells: [{ id: "fb-row", party_member_id: "pm-pc", name: "Fireball", level: 3, is_known: true, is_prepared: true, always_prepared: false, source_type: "class", source_class_id: "cls-wiz", casting_ability: null, uses_per_day: null, uses_remaining: null }],
        classes: [wizard],
        definitions: { system: [{ id: "def-wiz", caster_type: "prepared", prepared_ability: "int" }], custom: [], subclasses: [] },
      },
    };
    const caster = hero(0, 3, { faction_id: "m", action_uses: { "slots/3": { used: 1, per_day: 2 } } });
    const r = await ask({ combatants: [caster, wolf({ faction_id: "p", position: { x: 6, y: 3 } })], sheets, spells: [fireball()], speeds: [{ id: "pm-pc", speed: 25 }] }, "pc");
    expect(ids(r).some((id) => id.startsWith("spell:Fireball:3:"))).toBe(true);
  });

  // PHB 2014 "Extra Attack" and "Fighter: Action Surge": the DM's list shows what take_turn plays. A 5th-level Fighter (two attacks, four on the surge) holding `pieces` of each of a dagger and a
  // handaxe to throw: with one of each the two pieces make the mixed Extra Attack and no surge (two swings are no more than the Attack action); with two of each the surge swings all four.
  // Bug caught: a surge listed that adds no swing, or a mixed set left out of the list.
  it.each([
    { pieces: 1, offered: ["Extra Attack (Handaxe (thrown) + Dagger (thrown))"], notOffered: ["Action Surge (Handaxe (thrown) + Dagger (thrown))"] },
    { pieces: 2, offered: ["Extra Attack (Handaxe (thrown))", "Action Surge (Handaxe (thrown) + Dagger (thrown))"], notOffered: [] },
  ])("lists the mixed sets a Fighter with $pieces of each throwing weapon can make", async ({ pieces, offered, notOffered }) => {
    const weapon = (id: string, name: string, dice: string) => ({ id, name, item_type: "weapon", properties: ["light", "thrown"], tags: [], subtype: null, charges: null, weapon_range: "20/60", damage_rolls: [{ dice, type: "piercing" }], rarity: "mundane", image_url: null, description: "" });
    const stack = (id: string, itemId: string, name: string) => ({ id, item_id: itemId, library_item_id: null, name, quantity: pieces, carried_by: "pm-pc", slot: "main_hand", location: "equipped", quality: "standard" });
    const fighter = { id: "cls-fig", party_member_id: "pm-pc", class_name: "Fighter", class_definition_id: "def-fig", class_definition_kind: "system", subclass_name: null, subclass_definition_id: null, subclass_variant: null, levels: 5, is_primary: true, hit_dice_used: 0, sort_order: 0, capabilities: [] } as unknown as CharacterClass;
    const sheets = {
      ...SAM,
      members: [{ ...SAM.members[0], str: 16, level: 5 }],
      inventory: [stack("inv-dagger", "dagger", "Dagger"), stack("inv-axe", "axe", "Handaxe")],
      items: [weapon("dagger", "Dagger", "1d4"), weapon("axe", "Handaxe", "1d6")],
      casting: { ...NO_CASTING, classes: [fighter] },
    } as unknown as PlayerSheets;
    const r = await ask({ combatants: [hero(0, 3, { faction_id: "m" }), wolf({ faction_id: "p", position: { x: 6, y: 3 } })], sheets, speeds: [{ id: "pm-pc", speed: 25 }] }, "pc");
    for (const name of offered) expect(ids(r)).toContain(`attack:actions:${name}:wolf`);
    for (const name of notOffered) expect(ids(r)).not.toContain(`attack:actions:${name}:wolf`);
  });

  // App convention: an ally never flees. Bug caught: Flee listed for an ally, which take_turn would refuse as not on offer.
  it("fails if an ally is offered Flee", async () => {
    const r = await ask({ combatants: [hero(0, 3, { faction_id: "m" }), wolf({ faction_id: "p", position: { x: 3, y: 3 } })], sheets: SAM, speeds: [{ id: "pm-pc", speed: 25 }] }, "pc");
    expect(r.options.some((o) => o.kind === "flee")).toBe(false);
    expect(r.options.some((o) => o.kind === "dodge")).toBe(true);
  });

  // Bug caught: a monster's options changed by the ally rule (Flee dropped for everyone).
  it("keeps Flee for a monster", async () => {
    const r = await ask({ combatants: [wolf({ hp: 2 }), hero(3, 0)] });
    expect(r.options.some((o) => o.kind === "flee")).toBe(true);
  });
});

describe("validateOptionsRequest", () => {
  it("needs both ids as non-empty strings", () => {
    expect(validateOptionsRequest({ encounterId: "e", instanceId: "i" })).toEqual({ encounterId: "e", instanceId: "i" });
    for (const bad of [null, [], {}, { encounterId: "e" }, { encounterId: "", instanceId: "i" }, { encounterId: "e", instanceId: 3 }]) {
      expect(() => validateOptionsRequest(bad)).toThrow(OptionsError);
    }
  });
});
