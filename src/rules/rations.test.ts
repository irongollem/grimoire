import { describe, expect, it } from "vitest";
import { daysWithoutFoodAllowed, hungerExhaustion, rationsNeeded } from "./rations";

describe("rationsNeeded", () => {
  // PHB 2014 "Food and Water" / PHB 2024 "Malnutrition": one pound of food a day each.
  it("is one a day for each traveller, a started day counting whole", () => {
    expect(rationsNeeded(3, 4)).toBe(12);
    expect(rationsNeeded(2.2, 1)).toBe(3);
  });

  // Bug caught: a negative or empty journey asking for negative food, or food for nobody.
  it("is nothing for no days or no travellers", () => {
    expect(rationsNeeded(0, 4)).toBe(0);
    expect(rationsNeeded(3, 0)).toBe(0);
    expect(rationsNeeded(-1, 2)).toBe(0);
  });
});

describe("going without food", () => {
  // PHB 2014 "Food and Water": 3 + Constitution modifier days, minimum 1; one level at the end of each day beyond.
  it.each([
    [2, 5, 5, 0],
    [2, 5, 6, 1],
    [0, 3, 3, 0],
    [0, 3, 5, 2],
    // The minimum of one day: a Constitution modifier of -3 or worse still allows one.
    [-4, 1, 1, 0],
    [-4, 1, 2, 1],
  ])("2014: Constitution %i allows %i days; %i days without costs %i", (con, allowed, days, levels) => {
    expect(daysWithoutFoodAllowed(con, "2014")).toBe(allowed);
    expect(hungerExhaustion(days, con, "2014")).toBe(levels);
  });

  // PHB 2024 Rules Glossary "Malnutrition": one level at the end of the fifth day, and each day after.
  // Bug caught: the 2014 allowance (Constitution) applied to a 2024 table, or the fifth day read as free.
  it.each([
    [4, 0],
    [5, 1],
    [7, 3],
  ])("2024: %i days without costs %i, whatever the Constitution", (days, levels) => {
    expect(hungerExhaustion(days, 5, "2024")).toBe(levels);
    expect(hungerExhaustion(days, -2, "2024")).toBe(levels);
  });

  it("costs nothing for no days", () => {
    expect(hungerExhaustion(0, 0, "2014")).toBe(0);
  });
});
