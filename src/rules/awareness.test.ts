import { describe, it, expect } from "vitest";
import { explainAwareness, formatAwarenessUse, readAwareness, type AwarenessSource } from "@/rules/awareness";

// WIS 14 (+2), proficient at PB 3: Perception +5.
const base: AwarenessSource = {
  str: 10, dex: 10, con: 10, int: 10, wis: 14, cha: 10,
  proficiency_bonus: 3,
  skill_proficiencies: { perception: "proficient" },
  conditions: [],
  ruleset: "2014",
};
const poisoned = { ...base, conditions: [{ name: "Poisoned" }] };

describe("readAwareness", () => {
  it("adds the Perception bonus to the first die when nothing imposes disadvantage, even if the second is higher", () => {
    // A bug reading max() or the second die would give 18 + 5.
    expect(readAwareness(base, { d20: 12, d20Second: 18 }).total).toBe(12 + 5);
  });

  it("uses the bonus as the character stands now, so a level-up changes the total but not the die", () => {
    expect(readAwareness({ ...base, proficiency_bonus: 4 }, { d20: 12, d20Second: 3 }).total).toBe(12 + 2 + 4);
  });

  it("takes the lower die while Poisoned (PHB 2014 / SRD 5.2 \"Poisoned\": disadvantage on ability checks)", () => {
    const reading = readAwareness(poisoned, { d20: 15, d20Second: 4 });
    expect(reading.die).toBe(4);
    expect(reading.total).toBe(4 + 5);
    expect(reading.disadvantageFrom).toEqual(["Poisoned"]);
  });

  it("Exhaustion 1 is disadvantage in 2014 and -2 in 2024, never both (PHB 2014 / SRD 5.2 \"Exhaustion\")", () => {
    const exhausted = [{ name: "Exhaustion", level: 1 }];
    const old = readAwareness({ ...base, conditions: exhausted, ruleset: "2014" }, { d20: 15, d20Second: 4 });
    const now = readAwareness({ ...base, conditions: exhausted, ruleset: "2024" }, { d20: 15, d20Second: 4 });
    expect([old.total, old.disadvantageFrom]).toEqual([4 + 5, ["Exhaustion"]]);
    expect([now.total, now.disadvantageFrom]).toEqual([15 + 5 - 2, []]);
  });

  it("2024 Exhaustion takes 2 per level (SRD 5.2: level 3 is -6)", () => {
    expect(readAwareness({ ...base, ruleset: "2024", conditions: [{ name: "Exhaustion", level: 3 }] }, { d20: 15, d20Second: 4 }).penalty).toBe(-6);
  });
});

describe("explainAwareness", () => {
  it("names both dice and the cause under disadvantage, so the DM sees why the number dropped", () => {
    const dice = { d20: 15, d20Second: 4 };
    expect(explainAwareness(dice, readAwareness(poisoned, dice))).toBe("lower of 15 and 4 (disadvantage: Poisoned) + 5");
  });
});

describe("formatAwarenessUse", () => {
  it("lists totals per character, leaving out characters whose roll was null (first rolls)", () => {
    const text = formatAwarenessUse([
      { name: "Mira", member: base, used: { d20: 10, d20Second: 2 } },
      { name: "Bram", member: base, used: null },
    ]);
    expect(text).toBe("Awareness used: Mira 15");
  });

  it("returns null when every use was a first roll, so no toast shows", () => {
    expect(formatAwarenessUse([{ name: "Bram", member: base, used: null }])).toBeNull();
  });

  it("flags nat 20 and nat 1 off the die that counts, not the total or the first die", () => {
    const text = formatAwarenessUse([
      { name: "A", member: base, used: { d20: 20, d20Second: 3 } },
      // The first die is a 20, but disadvantage makes the 1 count.
      { name: "B", member: poisoned, used: { d20: 20, d20Second: 1 } },
      // Total 20 but the die is 15: no flag.
      { name: "C", member: base, used: { d20: 15, d20Second: 20 } },
    ]);
    expect(text).toBe("Awareness used: A 25 (nat 20), B 6 (nat 1, disadvantage), C 20");
  });
});
