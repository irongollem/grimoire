import { describe, expect, it } from "vitest";
import { isRationRow, planProvisions, takeFromRows, type ProvisionTraveller } from "./provisions";

const hiker = (over: Partial<ProvisionTraveller> = {}): ProvisionTraveller => ({
  id: "wren",
  carried: 0,
  daysWithoutFood: 0,
  exhaustion: 0,
  conModifier: 2,
  ruleset: "2014",
  ...over,
});
const never = (): number => {
  throw new Error("no dice expected");
};
const row = (id: string, name: string, quantity: number, quality: "standard" | "ruined" = "standard") => ({ id, name, quantity, quality });

describe("isRationRow", () => {
  it.each([
    ["Rations (1 day)", 1, "standard", true],
    ["  rations (1 day) ", 1, "standard", true],
    ["Rations, dried", 2, "standard", true],
    ["Rations (1 day)", 0, "standard", false],
    ["Rations (1 day)", 3, "ruined", false],
    ["Rope", 3, "standard", false],
  ] as const)("%s x%i (%s) is a ration: %s", (name, quantity, quality, expected) => {
    expect(isRationRow({ name, quantity, quality })).toBe(expected);
  });
});

describe("takeFromRows", () => {
  it("uses the smallest stacks first so stray rations are used up before a bundle is broken", () => {
    const rows = [row("big", "Rations (1 day)", 10), row("one", "Rations (1 day)", 1), row("three", "Rations (1 day)", 3)];
    expect(takeFromRows(rows, 2)).toEqual([
      { id: "one", newQuantity: 0 },
      { id: "three", newQuantity: 2 },
    ]);
  });
  it("never touches ruined rations or other items", () => {
    expect(takeFromRows([row("bad", "Rations (1 day)", 5, "ruined"), row("rope", "Rope", 5)], 2)).toEqual([]);
  });
  it("takes only what there is when asked for more", () => {
    expect(takeFromRows([row("a", "Rations (1 day)", 2)], 9)).toEqual([{ id: "a", newQuantity: 0 }]);
  });
});

describe("planProvisions hunger by edition", () => {
  // PHB 2014 "Food and Water": 3 + Con modifier days free, then a level a day. Con +2 is 5 free days.
  it("2014 with Con +2 goes 5 days free and is hurt on the sixth", () => {
    const free = planProvisions({ days: 5, travellers: [hiker()], stash: 0, forage: null, roll: never });
    expect(free.travellers[0]).toMatchObject({ hungryDays: 5, exhaustionGained: 0, daysWithoutFood: 5 });
    const hurt = planProvisions({ days: 6, travellers: [hiker()], stash: 0, forage: null, roll: never });
    expect(hurt.travellers[0].exhaustionGained).toBe(1);
  });
  // SRD 5.2 "Malnutrition": the fifth day without food is the first that costs, so four are free.
  it("2024 goes 4 days free and is hurt on the fifth, whatever the Constitution", () => {
    const t = hiker({ ruleset: "2024", conModifier: 5 });
    expect(planProvisions({ days: 4, travellers: [t], stash: 0, forage: null, roll: never }).travellers[0].exhaustionGained).toBe(0);
    expect(planProvisions({ days: 7, travellers: [t], stash: 0, forage: null, roll: never }).travellers[0].exhaustionGained).toBe(3);
  });
  it("counts on from days already gone without, and eating resets the run", () => {
    const already = planProvisions({ days: 1, travellers: [hiker({ daysWithoutFood: 5 })], stash: 0, forage: null, roll: never });
    expect(already.travellers[0].exhaustionGained).toBe(1);
    const fed = planProvisions({ days: 1, travellers: [hiker({ daysWithoutFood: 5, carried: 1 })], stash: 0, forage: null, roll: never });
    expect(fed.travellers[0]).toMatchObject({ daysWithoutFood: 0, exhaustionGained: 0, fromOwn: 1 });
  });
  it("a meal midway resets the count: 3 hungry days, a meal, 3 hungry days is no exhaustion for Con +0 2024", () => {
    // 2024 allows 4. Carried 1 ration eaten on day 1 only; then 3 hungry days (run 3): none.
    const p = planProvisions({ days: 4, travellers: [hiker({ ruleset: "2024", carried: 1 })], stash: 0, forage: null, roll: never });
    expect(p.travellers[0]).toMatchObject({ hungryDays: 3, exhaustionGained: 0 });
  });
  it("never takes a character past Exhaustion 6", () => {
    const p = planProvisions({ days: 20, travellers: [hiker({ exhaustion: 4 })], stash: 0, forage: null, roll: never });
    expect(p.travellers[0].exhaustionGained).toBe(2);
  });
});

describe("planProvisions who feeds whom", () => {
  it("eats from the pack first and only then the stash", () => {
    const p = planProvisions({ days: 3, travellers: [hiker({ carried: 2 })], stash: 5, forage: null, roll: never });
    expect(p.travellers[0]).toMatchObject({ fromOwn: 2, fromStash: 1, hungryDays: 0 });
    expect(p.fromStash).toBe(1);
  });
  it("shares one stash between travellers, in order, until it runs dry", () => {
    const p = planProvisions({ days: 1, travellers: [hiker({ id: "a" }), hiker({ id: "b" }), hiker({ id: "c" })], stash: 2, forage: null, roll: never });
    expect(p.travellers.map((t) => t.hungryDays)).toEqual([0, 0, 1]);
    expect(p.fromStash).toBe(2);
  });
});

describe("planProvisions foraging", () => {
  const forager = { id: "wren", survivalBonus: 3, wisModifier: 1 };
  const rolls = (...faces: number[]) => {
    const queue = [...faces];
    return (): number => {
      const next = queue.shift();
      if (next === undefined) throw new Error("out of dice");
      return next;
    };
  };

  // DMG "Foraging": succeed on Wisdom (Survival) against the DC, find 1d6 + Wisdom modifier pounds.
  it("a success at the DC finds 1d6 + Wisdom modifier, and the forage is eaten before the pack", () => {
    // d20 12 + 3 = 15 meets DC 15; d6 3 + 1 = 4 pounds, 2 travellers eat 1 each; 2 pounds are lost.
    const p = planProvisions({
      days: 1,
      travellers: [hiker({ id: "wren", carried: 3 }), hiker({ id: "dorn", carried: 3 })],
      stash: 0,
      forage: { dc: 15, foragers: [forager] },
      roll: rolls(12, 3),
    });
    expect(p.forage[0].rolls[0]).toEqual({ id: "wren", d20: 12, total: 15, success: true, found: 4 });
    expect(p.travellers.map((t) => [t.fromForage, t.fromOwn])).toEqual([[1, 0], [1, 0]]);
  });
  it("a roll one under the DC finds nothing and rolls no food die", () => {
    const p = planProvisions({ days: 1, travellers: [hiker({ carried: 1 })], stash: 0, forage: { dc: 15, foragers: [forager] }, roll: rolls(11) });
    expect(p.forage[0].rolls[0]).toMatchObject({ total: 14, success: false, found: 0 });
    expect(p.travellers[0].fromOwn).toBe(1);
  });
  it("a negative Wisdom modifier never finds less than nothing", () => {
    const p = planProvisions({ days: 1, travellers: [hiker()], stash: 0, forage: { dc: 10, foragers: [{ ...forager, wisModifier: -3 }] }, roll: rolls(20, 2) });
    expect(p.forage[0].rolls[0].found).toBe(0);
  });
  it("rolls again each day and leftover forage is not kept for the next", () => {
    // Day 1 finds 6 pounds for one traveller; day 2 fails: the traveller goes hungry, not fed from day 1.
    const p = planProvisions({ days: 2, travellers: [hiker()], stash: 0, forage: { dc: 10, foragers: [forager] }, roll: rolls(15, 6, 1) });
    expect(p.forage).toHaveLength(2);
    expect(p.travellers[0]).toMatchObject({ fromForage: 1, hungryDays: 1 });
  });
});
