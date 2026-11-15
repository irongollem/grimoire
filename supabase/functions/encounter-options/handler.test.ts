/**
 * The options function against an in-memory fight. Every expected value is worked out from the map drawn in the
 * comment above it: x to the right, y down, a Medium creature at (x,y) fills that one square, 5 ft a step.
 */
import { describe, expect, it } from "vitest";
import { combatant, pc } from "../../../src/rules/fight/fightTestKit";
import type { FightMapInput } from "../../../src/rules/fight/terrain/battleMap";
import type { GridCalibration } from "../../../src/types/location.types";
import type { Monster } from "../../../src/types/monster.types";
import type { RunCombatant } from "../../../src/types/encounter.types";
import { emptyDefenses, type StatBlockEntry } from "../../../src/types/statBlock.types";
import { computeOptions, meleeReachFeet, OptionsError, validateOptionsRequest, type OptionsDeps, type OptionsFight } from "./handler";

const CALIBRATION = { cells_per_image_width: 10, origin_x_pct: 0, origin_y_pct: 0, origin_cell_x: 0, origin_cell_y: 0 } as GridCalibration;
// A calibrated picture with nothing drawn on it: open ground.
const OPEN_GROUND: FightMapInput = {
  encounterLocation: {
    id: "field", location_type: "region", map_url: null, grid_calibration: null, map_layer_url: "field.png", map_layer_stand_url: null,
    map_layer_stand_live_url: null, map_layer_calibration: CALIBRATION, plan_size: null, map_live: null,
  },
  parent: null,
  regions: [],
  doorStates: [],
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
  map?: FightMapInput | null;
  version?: number;
}
function deps(s: Setup): OptionsDeps {
  const fight: OptionsFight = { version: s.version ?? 7, combatants: s.combatants, ruleset: "2014" };
  return {
    loadFight: async () => fight,
    loadStatBlocks: async () => ({ monsters: s.monsters ?? [monster("m-wolf", [attack("Bite")])], npcs: [], companions: [] }),
    loadMemberSpeeds: async () => s.speeds ?? [],
    loadMapInput: async () => (s.map === undefined ? OPEN_GROUND : s.map),
  };
}
const ask = (s: Setup, instanceId = "wolf") => computeOptions({ encounterId: "enc", instanceId }, deps(s));
const ids = (r: { options: { id: string }[] }) => r.options.map((o) => o.id);

describe("computeOptions", () => {
  it("offers the stat block's attack from the speed on the stat block, and names the row version it read", async () => {
    // Wolf (0,0) speed 30; the hero stands at (4,0). Squares beside the hero are x=3: 3 steps, 15 ft; the top row, (3,-1).
    const r = await ask({ combatants: [wolf(), hero(4, 0)], version: 7 });
    expect(r.version).toBe(7);
    const bite = r.options.find((o) => o.id === "attack:actions:Bite:pc");
    expect(bite?.feet).toBe(15);
    expect(bite?.destination).toEqual({ x: 3, y: -1 });
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
    // The hero (0,0) has speed 25 on the sheet; the wolf is at (3,0). No stat block, so no attack. A Dash (50 ft) reaches the
    // squares beside the wolf at x=2: 2 steps, 10 ft; the top row (2,-1). A player is also offered Flee (the farthest square from the wolf).
    const r = await ask({ combatants: [hero(0, 0, { faction_id: "m" }), wolf({ faction_id: "p", position: { x: 3, y: 0 } })], speeds: [{ id: "pm-pc", speed: 25 }] }, "pc");
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

describe("validateOptionsRequest", () => {
  it("needs both ids as non-empty strings", () => {
    expect(validateOptionsRequest({ encounterId: "e", instanceId: "i" })).toEqual({ encounterId: "e", instanceId: "i" });
    for (const bad of [null, [], {}, { encounterId: "e" }, { encounterId: "", instanceId: "i" }, { encounterId: "e", instanceId: 3 }]) {
      expect(() => validateOptionsRequest(bad)).toThrow(OptionsError);
    }
  });
});
