import { describe, expect, it } from "vitest";
import { hitPointsText, parseHitPointChange, rollTotal } from "./hitPoints.ts";

const HONEYCOMB = "f5f67a48-5233-473b-84a3-5eb024491c86";
const hurt = { current: 15, max: 58 };

describe("parseHitPointChange", () => {
  // Bug caught (seen live): the narrator wrote "8 hit points are restored" with no dice thrown.
  it("refuses a change with no roll made this turn", () => {
    const parsed = parseHitPointChange({ change: "heal", why: "Potion of Healing" }, { hitPoints: hurt, lastRoll: null });
    expect(parsed.ok).toBe(false);
  });

  // Bug caught: the amount taken from the model's own input instead of from the dice.
  it("takes the roll's total and ignores an amount the narrator names", () => {
    const parsed = parseHitPointChange({ change: "heal", why: "Potion of Healing", amount: 40 }, { hitPoints: hurt, lastRoll: 7 });
    expect(parsed).toMatchObject({ ok: true, value: { rolled: 7, after: 22, max: 58 } });
  });

  // Bug caught: healing past the character's most, or harm below nothing.
  it("stops at the sheet's limits both ways", () => {
    expect(parseHitPointChange({ change: "heal", why: "A long rest" }, { hitPoints: { current: 55, max: 58 }, lastRoll: 9 })).toMatchObject({ value: { after: 58 } });
    expect(parseHitPointChange({ change: "harm", why: "The fall" }, { hitPoints: { current: 4, max: 58 }, lastRoll: 9 })).toMatchObject({ value: { after: 0 } });
  });

  // Bug caught: harm added instead of taken.
  it("harm takes hit points away", () => {
    expect(parseHitPointChange({ change: "harm", why: "The fall" }, { hitPoints: hurt, lastRoll: 6 })).toMatchObject({ value: { after: 9 } });
  });

  // Bug caught: a potion that is drunk and still in the giver's pocket; or half a naming (whose, but not what) kept.
  it("keeps whose thing was used up, and refuses half of that", () => {
    const whole = parseHitPointChange({ change: "heal", why: "Potion of Healing", used_by: HONEYCOMB, used_thing: " Potion of Healing " }, { hitPoints: hurt, lastRoll: 7 });
    expect(whole).toMatchObject({ value: { used: { characterId: HONEYCOMB, thing: "Potion of Healing" } } });
    expect(parseHitPointChange({ change: "heal", why: "Potion", used_by: HONEYCOMB }, { hitPoints: hurt, lastRoll: 7 }).ok).toBe(false);
    expect(parseHitPointChange({ change: "heal", why: "Potion", used_by: "Honeycomb", used_thing: "Potion" }, { hitPoints: hurt, lastRoll: 7 }).ok).toBe(false);
  });

  // Bug caught: a character with no hit points on the sheet written to 0.
  it("refuses when the sheet has no hit points", () => {
    expect(parseHitPointChange({ change: "harm", why: "The fall" }, { hitPoints: null, lastRoll: 6 }).ok).toBe(false);
  });
});

describe("hitPointsText", () => {
  // Bug caught: the narrator told "regains 9" to a character who could only take 3.
  it("says what actually moved, and that the character dropped", () => {
    const topped = parseHitPointChange({ change: "heal", why: "Rest" }, { hitPoints: { current: 55, max: 58 }, lastRoll: 9 });
    if (!topped.ok) throw new Error("expected a change");
    expect(hitPointsText(topped.value, 55)).toContain("regains 3 hit points");
    const down = parseHitPointChange({ change: "harm", why: "The fall" }, { hitPoints: { current: 4, max: 58 }, lastRoll: 9 });
    if (!down.ok) throw new Error("expected a change");
    expect(hitPointsText(down.value, 4)).toContain("unconscious");
  });
});

describe("rollTotal", () => {
  // Bug caught: a hidden roll's total not counted, so a hidden harm could never land.
  it("reads the total of an open or a hidden roll, and nothing from what is not a roll", () => {
    expect(rollTotal(JSON.stringify({ hidden: false, total: 7 }))).toBe(7);
    expect(rollTotal(JSON.stringify({ hidden: true, total: 5 }))).toBe(5);
    expect(rollTotal("The dice could not be rolled.")).toBeNull();
    expect(rollTotal(JSON.stringify({ total: "7" }))).toBeNull();
  });
});
