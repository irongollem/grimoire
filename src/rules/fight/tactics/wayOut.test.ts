import { describe, expect, it } from "vitest";
import type { RunCombatant } from "../../../types/encounter.types.ts";
import type { MonsterStatBlock } from "../../../types/monster.types.ts";
import { emptyDefenses, type StatBlockEntry } from "../../../types/statBlock.types.ts";
import { usableWayOut, wayOutsOf, type WayOut } from "./wayOut.ts";

const block = (over: Partial<MonsterStatBlock> = {}): MonsterStatBlock => ({
  armor_class: 12, hit_points: "2d8", speed: "30 ft.", str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, challenge_rating: "1", defenses: emptyDefenses(), ...over,
});
const other = (name: string, description = "", extra: Record<string, unknown> = {}): StatBlockEntry => ({
  name, description, structured: { kind: "other", source: "manual", review: "unreadable", ...extra },
});
const hag = (): RunCombatant => ({
  instance_id: "hag", type: "monster", name: "Hag", faction_id: "m", initiative: null, hp: 20, max_hp: 100, ac: "12",
  conditions: [], curses: [], death_saves: { successes: 0, failures: 0 }, dex_mod: 0,
});
const names = (b: MonsterStatBlock) => wayOutsOf(b).map((w) => w.name);

// The 2024 night hag's Spellcasting, as the library prints it.
const NIGHT_HAG_2024 = other(
  "Spellcasting",
  "The hag casts one of the following spells, requiring no Material components and using Charisma as the spellcasting ability (spell save DC 14):\n\n- **At Will:** Detect Magic, Etherealness, Magic Missile\n- **2/Day Each:** Phantasmal Killer, Plane Shift",
);

describe("wayOutsOf", () => {
  // SRD 5.1 night hag, "Etherealness" is an action of its own.
  it("fails if an action named Etherealness is not a way out that leaves, or is given a limit it does not have", () => {
    const ways = wayOutsOf(block({ actions: [other("Etherealness", "The hag magically enters the Ethereal Plane from the Material Plane, or vice versa.")] }));
    expect(ways).toEqual([{ name: "Etherealness", effect: "leaves", slot: "action", useKey: null, limit: null }]);
  });

  // SRD 5.1 green hag, "Invisible Passage".
  it("fails if Invisible Passage is read as a way out that leaves rather than one that only hides", () => {
    expect(wayOutsOf(block({ actions: [other("Invisible Passage")] }))[0]).toMatchObject({ name: "Invisible Passage", effect: "unseen" });
  });

  // 2014 stat blocks print a limit in the name: "Etherealness (Recharges after a Long Rest)" style parentheticals.
  it("fails if a trailing parenthetical or odd letter case on the name stops it matching", () => {
    expect(names(block({ actions: [other("  ETHEREALNESS (1/Day) ")] }))).toEqual(["Etherealness"]);
  });

  it("fails if a power whose name merely contains a way out's is taken for one", () => {
    expect(names(block({ actions: [other("Etherealness Sickness")] }))).toEqual([]);
  });

  // SRD 5.2 night hag: At Will gives no limit, 2/Day Each gives a per-day count per spell.
  it("fails if the 2024 markdown spell lines lose Etherealness at will or the 2/Day limit on Plane Shift", () => {
    const ways = wayOutsOf(block({ actions: [NIGHT_HAG_2024] }));
    expect(ways).toEqual([
      { name: "Etherealness", effect: "leaves", slot: "action", useKey: null, limit: null },
      { name: "Plane Shift", effect: "leaves", slot: "action", useKey: "spell/Plane Shift", limit: { per_day: 2 } },
    ]);
  });

  // SRD 5.1 innate spellcasting: "2/day each: plane shift (self only), ray of enfeeblement".
  it("fails if a 2014 lower-case 2/day each line with a parenthetical is not read", () => {
    const ways = wayOutsOf(block({ special_abilities: [other("Innate Spellcasting", "The hag's innate spellcasting ability is Charisma (spell save DC 14). She can cast:\nAt will: detect magic, magic missile\n2/day each: plane shift (self only), ray of enfeeblement")] }));
    expect(ways).toEqual([{ name: "Plane Shift", effect: "leaves", slot: "action", useKey: "spell/Plane Shift", limit: { per_day: 2 } }]);
  });

  // The slot line `4th level (3 slots)` is per-day by app convention: the server casts no other spell, so slots are whole.
  it("fails if a spell slot line is not tallied against the slots of that level", () => {
    const ways = wayOutsOf(block({ special_abilities: [other("Spellcasting", "Cantrips (at will): light\n4th level (3 slots): dimension door, greater invisibility")] }));
    expect(ways).toEqual([
      { name: "Dimension Door", effect: "leaves", slot: "action", useKey: "slots/4", limit: { per_day: 3 } },
      { name: "Greater Invisibility", effect: "unseen", slot: "action", useKey: "slots/4", limit: { per_day: 3 } },
    ]);
  });

  // SRD 5.1: Misty Step is a 30-foot hop, not out of the fight.
  // SRD 5.1 blink dog, "Teleport (Recharge 4-6)": "teleports ... up to 40 feet". A hop like that leaves it in the fight.
  it("fails if a monster's own short Teleport action takes it out of the fight", () => {
    const blinkDog = block({ actions: [other("Teleport (Recharge 4-6)", "The dog magically teleports, along with any equipment it is wearing or carrying, up to 40 feet to an unoccupied space it can see.")] });
    expect(wayOutsOf(blinkDog)).toEqual([]);
  });

  // SRD 5.1 archmage, "7th level (1 slot): teleport": the spell, which takes its caster miles away.
  it("fails if the Teleport spell stops counting because the action of that name does not", () => {
    const archmage = block({ special_abilities: [other("Spellcasting", "The archmage is an 18th-level spellcaster.\n7th level (1 slot): teleport")] });
    expect(wayOutsOf(archmage)).toEqual([{ name: "Teleport", effect: "leaves", slot: "action", useKey: "slots/7", limit: { per_day: 1 } }]);
  });

  it("fails if Misty Step counts as a way out", () => {
    expect(names(block({ special_abilities: [other("Innate Spellcasting", "At will: misty step, detect magic")] }))).toEqual([]);
  });

  it("fails if a spell named outside a spellcasting entry is read as one the creature can cast", () => {
    expect(names(block({ actions: [other("Dire Warning", "At will: etherealness")] }))).toEqual([]);
  });

  // SRD 5.1 hag, "Shared Spellcasting (Coven Only)": the spells need all three hags within 30 feet, so they are not hers alone to cast.
  it("fails if a coven's shared spells are read as spells the hag can cast by herself", () => {
    const shared = other("Shared Spellcasting (Coven Only)", "While all three members of a hag coven are within 30 feet of one another, they can each cast the following spells from the wizard's spell list but must share the spell slots among themselves:\n\n1st level (4 slots): identify, ray of sickness\n6th level (1 slot): plane shift");
    expect(names(block({ special_abilities: [shared] }))).toEqual([]);
  });

  // App convention: leaving the fight beats hiding, and an unlimited power beats a limited one.
  it("fails if the order is not leaves before unseen, then unlimited before limited", () => {
    const ways = wayOutsOf(block({
      actions: [other("Invisible Passage"), NIGHT_HAG_2024],
    }));
    expect(ways.map((w) => w.name)).toEqual(["Etherealness", "Plane Shift", "Invisible Passage"]);
    const limitedLeaves = wayOutsOf(block({ special_abilities: [other("Spellcasting", "At will: invisibility\n1/day: teleport")] }));
    expect(limitedLeaves.map((w) => w.name)).toEqual(["Teleport", "Invisibility"]);
  });

  it("fails if a name that appears as an action and as a spell is listed twice", () => {
    expect(names(block({ actions: [other("Etherealness"), NIGHT_HAG_2024] }))).toEqual(["Etherealness", "Plane Shift"]);
  });

  it("fails if a way out on the bonus action list is costed as an Action, or a per-day limit on an entry is lost", () => {
    const ways = wayOutsOf(block({ bonus_actions: [other("Invisibility", "", { uses: { count: 1, per: "day" } })] }));
    expect(ways).toEqual([{ name: "Invisibility", effect: "unseen", slot: "bonus", useKey: "bonus_actions/Invisibility", limit: { per_day: 1 } }]);
  });
});

describe("usableWayOut", () => {
  const plane: WayOut = { name: "Plane Shift", effect: "leaves", slot: "action", useKey: "spell/Plane Shift", limit: { per_day: 2 } };
  const ether: WayOut = { name: "Etherealness", effect: "leaves", slot: "action", useKey: null, limit: null };
  const passage: WayOut = { name: "Invisible Passage", effect: "unseen", slot: "action", useKey: null, limit: null };

  it("fails if the first way out is not the one returned for a creature that can use any", () => {
    expect(usableWayOut([ether, plane], hag())).toBe(ether);
  });

  // The 2/Day Each line: two casts and the power is gone.
  it("fails if a way out whose per-day uses are spent is still offered, or a half-spent one is refused", () => {
    expect(usableWayOut([plane], { ...hag(), action_uses: { "spell/Plane Shift": { used: 2 } } })).toBeNull();
    expect(usableWayOut([plane], { ...hag(), action_uses: { "spell/Plane Shift": { used: 1 } } })).toBe(plane);
  });

  it("fails if a spent recharge way out is offered", () => {
    const burst: WayOut = { ...ether, useKey: "actions/Etherealness", limit: { recharge: { min: 5, max: 6 } } };
    expect(usableWayOut([burst], { ...hag(), action_uses: { "actions/Etherealness": { used: 1 } } })).toBeNull();
  });

  it("fails if the next way out is not tried when the first is spent", () => {
    expect(usableWayOut([plane, passage], { ...hag(), action_uses: { "spell/Plane Shift": { used: 2 } } })).toBe(passage);
  });

  it("fails if a spent Action does not block an Action way out, or a spent Bonus Action blocks one that costs the Action", () => {
    expect(usableWayOut([ether], { ...hag(), action_used: true })).toBeNull();
    expect(usableWayOut([ether], { ...hag(), bonus_used: true })).toBe(ether);
    const quick: WayOut = { ...ether, slot: "bonus" };
    expect(usableWayOut([quick], { ...hag(), bonus_used: true })).toBeNull();
    expect(usableWayOut([quick], { ...hag(), action_used: true })).toBe(quick);
  });

  it("fails if an already Invisible creature is offered another unseen way out, or loses one that leaves", () => {
    const invisible = { ...hag(), conditions: [{ name: "Invisible" }] };
    expect(usableWayOut([passage], invisible)).toBeNull();
    expect(usableWayOut([passage, ether], invisible)).toBe(ether);
  });
});
