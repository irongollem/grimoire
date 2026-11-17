import { describe, expect, it } from "vitest";
import { carriedRoster, followersOf, pursuitLines } from "./pursuit.ts";
import type { Fighter, FightState } from "./fight.ts";

const nature = (pursuit: "stays" | "hunts" | "judges"): NonNullable<Fighter["nature"]> => ({ line: "", yields: true, immune: [], pursuit });
const fight: FightState = {
  encounterId: "enc-1",
  name: "The Watching Pack",
  phase: "over",
  round: 4,
  fighters: [
    { name: "Rosie", side: "party", hp: 6, maxHp: 15 },
    { name: "Hound 1", side: "enemy", hp: 4, maxHp: 11, nature: nature("hunts") },
    { name: "Hound 2", side: "enemy", hp: 0, maxHp: 11, nature: nature("hunts") },
    { name: "Glass Knight", side: "enemy", hp: 30, maxHp: 30, nature: nature("stays") },
    { name: "Cutpurse", side: "enemy", hp: 9, maxHp: 9, nature: nature("judges") },
    { name: "Stray", side: "enemy", hp: 5, maxHp: 5 },
    { name: "Honeycomb", side: "other", hp: 10, maxHp: 10 },
  ],
};

describe("followersOf", () => {
  // Bug caught: a creature that was brought down, or one that never leaves its post, turning up at the next place;
  // or the party's own side counted among those who follow.
  it("names the foes still standing who do not stay at their place", () => {
    expect(followersOf(fight)).toEqual(["Hound 1", "Cutpurse", "Stray"]);
    expect(followersOf(null)).toEqual([]);
  });
});

describe("carriedRoster", () => {
  const roster = [
    { instance_id: "p", type: "player", name: "Rosie", hp: 6, initiative: 14, position: { x: 3, y: 4 }, conditions: [{ name: "Dodging" }, { name: "Poisoned" }] },
    { instance_id: "h1", type: "monster", name: "Hound 1", hp: 4, max_hp: 11, initiative: 17, position: { x: 5, y: 5 }, conditions: [{ name: "Blinded" }] },
    { instance_id: "h2", type: "monster", name: "Hound 2", hp: 0, max_hp: 11, initiative: 9, position: { x: 6, y: 5 }, conditions: [] },
    { instance_id: "k", type: "monster", name: "Glass Knight", hp: 30, max_hp: 30, initiative: 3, position: { x: 1, y: 1 }, conditions: [] },
    { instance_id: "hc", type: "npc", name: "Honeycomb", hp: 10, bystander: true, initiative: 8, position: { x: 2, y: 2 }, conditions: [] },
    "nonsense",
  ];
  const carried = carriedRoster(roster, ["Hound 1", "Hound 2"]);

  // Bug caught (the reason for the story): the creatures that catch the party arriving at full health, or the
  // dead and the ones that stayed arriving with them.
  it("brings the played character and the foes who followed, as hurt as they were left", () => {
    expect(carried.map((c) => [c.instance_id, c.hp])).toEqual([["p", 6], ["h1", 4]]);
  });

  // Bug caught: tokens standing on the old map's squares on the new map, and the old order of turns kept, so the
  // fight resumes mid-round with nobody asked for initiative.
  it("leaves the old map and the old order behind", () => {
    expect(carried.every((c) => c.position === null && c.initiative === null)).toBe(true);
  });

  // Bug caught: a Dodge from the fight that was left still giving disadvantage in the next one; or a lasting
  // condition (poison, blindness) healed by running.
  it("drops what lasted a turn and keeps what lasts", () => {
    expect(carried.map((c) => (c.conditions as { name: string }[]).map((x) => x.name))).toEqual([["Poisoned"], ["Blinded"]]);
    expect(carriedRoster(null, ["Hound 1"])).toEqual([]);
  });
});

describe("pursuitLines", () => {
  // Bug caught: the narrator told to put a new fight together (fresh creatures), or not told which fight follows.
  it("names who follows with their hit points and the fight to start again", () => {
    const [line] = pursuitLines(fight);
    expect(line).toContain("Hound 1 (4 of 11 hit points), Cutpurse (9 of 9 hit points), Stray (5 of 5 hit points)");
    expect(line).toContain("encounter_id enc-1");
    expect(line).not.toContain("Glass Knight");
  });

  // Bug caught: a chase announced with nobody chasing.
  it("says nothing when nobody follows", () => {
    expect(pursuitLines({ ...fight, fighters: fight.fighters.filter((f) => f.name === "Rosie" || f.name === "Glass Knight") })).toEqual([]);
    expect(pursuitLines(null)).toEqual([]);
  });
});
