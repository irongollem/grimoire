import { describe, expect, it } from "vitest";
import type { TurnOption, TurnOptionSpell } from "../terrain/options/types";
import { isLeveledCast } from "./healChoice";
import { surgeCasts } from "./surgeCast";

const base = { destination: null, path: null, feet: null, attack: null, distanceFeet: null, provokes: [], exposure: [] } satisfies Pick<TurnOption, "destination" | "path" | "feet" | "attack" | "distanceFeet" | "provokes" | "exposure">;
const cast = (name: string, level: number, damage: number | null, over: Partial<TurnOptionSpell> = {}): TurnOption => ({
  ...base, id: `spell:${name}:${level}:foe`, kind: "spell", targetId: "foe", summary: `Cast ${name}`,
  spell: { name, castLevel: level, kind: "save", targetIds: ["foe"], friendsCaught: [], spends: level > 0, distanceFeet: 25, hitChance: 0.5, expectedDamage: damage, ...over },
});
const swing = (action: string, damage: number | null, over: Partial<TurnOption> = {}, list: "actions" | "bonus_actions" = "actions"): TurnOption => ({
  ...base, id: `attack:${list}:${action}:foe`, kind: "attack", targetId: "foe", summary: `Attack with ${action}`, ...over,
  attack: { list, action, steps: null, distanceFeet: 5, cover: "none", longRange: false, closeCombat: false, hitChance: 0.6, expectedDamage: damage },
});
const only = (...later: TurnOption[]) => () => later;

describe("surgeCasts: the options an Action Surge carries a cast with", () => {
  // PHB 2014 "Action Surge": one additional action. A Fireball and, standing still, an Attack action: one composite, both actions' damage together (28 + 9).
  it("makes a cast and the best action that follows it into one turn", () => {
    const [turn] = surgeCasts([cast("Fireball", 3, 28)], only(swing("Longsword", 9, { feet: 0 }), swing("Dagger", 4, { feet: 0 })));
    expect(turn.id).toBe("surge:spell:Fireball:3:foe+attack:actions:Longsword:foe");
    expect(turn.spell?.expectedDamage).toBe(37);
    expect(turn.spell?.surge?.second.id).toBe("attack:actions:Longsword:foe");
  });

  // Bug caught: an extra action that walks (a surge is a second action from the same square: the walk would come before the cast's own spot), or one spent from the Bonus Action list,
  // or the Action Surge entry itself (one surge is one extra action).
  it.each([
    { name: "an attack that moves", second: swing("Longsword", 9, { feet: 10 }) },
    { name: "a Bonus Action attack", second: swing("Offhand", 9, { feet: 0 }, "bonus_actions") },
    { name: "the Action Surge entry", second: swing("Action Surge (Longsword)", 18, { feet: 0 }) },
  ])("makes no composite from $name", ({ second }) => {
    expect(surgeCasts([cast("Fireball", 3, 28)], only(second))).toEqual([]);
  });

  // The second action that catches the mover's own side is not used, and neither is one that adds nothing. Bug caught: a surge spent on a Fireball into the party, or on a cast that does no damage.
  it.each([
    { name: "a cast that catches a friend", second: cast("Fireball", 3, 28, { friendsCaught: ["pip"] }) },
    { name: "a cast of unknown damage", second: cast("Mystery", 1, null) },
    { name: "a cast that does nothing", second: cast("Fizzle", 1, 0) },
  ])("makes no composite from $name", ({ second }) => {
    expect(surgeCasts([cast("Fireball", 3, 28)], only(second))).toEqual([]);
  });

  // Bug caught: a first cast that catches a friend, or one of unknown damage, carrying a surge.
  it.each([
    { name: "catches a friend", first: cast("Fireball", 3, 28, { friendsCaught: ["pip"] }) },
    { name: "has unknown damage", first: cast("Mystery", 3, null) },
  ])("makes no composite when the first cast $name", ({ first }) => {
    expect(surgeCasts([first], only(swing("Longsword", 9, { feet: 0 })))).toEqual([]);
  });

  // Only the best three first casts are weighed: the options assembly runs once for each. Bug caught: an assembly per cast of a long spell list.
  it("weighs at most three first casts, the strongest", () => {
    const asked: string[] = [];
    surgeCasts([cast("A", 1, 5), cast("B", 1, 9), cast("C", 1, 7), cast("D", 1, 3)], (first) => { asked.push(first.spell?.name ?? ""); return [swing("Longsword", 9, { feet: 0 })]; });
    expect(asked).toEqual(["B", "C", "A"]);
  });

  // PHB 2014 ch. 10 "Bonus Action": a Bonus Action heal never rides two leveled casts. A cantrip and an attack is not leveled; a cantrip then a leveled spell is.
  it("counts a composite of two actions as leveled when either action casts a leveled spell", () => {
    const cantripThenBlow = surgeCasts([cast("Fire Bolt", 0, 11)], only(swing("Longsword", 9, { feet: 0 })))[0];
    const cantripThenBall = surgeCasts([cast("Fire Bolt", 0, 11)], only(cast("Fireball", 3, 28)))[0];
    expect(isLeveledCast(cantripThenBlow)).toBe(false);
    expect(isLeveledCast(cantripThenBall)).toBe(true);
  });
});
