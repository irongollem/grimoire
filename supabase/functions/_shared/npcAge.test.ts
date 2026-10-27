import { describe, expect, it } from "vitest";
import { bornYearFromAge, campaignToday, completedYears, plainAgeYears, promptAge } from "./npcAge";

describe("plainAgeYears", () => {
  it.each([
    ["45", 45],
    [" 45 ", 45],
    ["45 years", 45],
    ["45 years old", 45],
    ["1 year old", 1],
    ["45 yrs", 45],
    ["about 45", 45],
    ["Aged 45", 45],
    ["0", 0],
  ])("reads %j as %j", (text, years) => {
    expect(plainAgeYears(text)).toBe(years);
  });

  it.each([
    "middle-aged", "ancient", "20-25", "30s", "early 40s", "45 or so", "-3", "10000",
    "12345 years", "", "   ", "4.5", "45 centuries",
  ])("rejects %j", (text) => {
    expect(plainAgeYears(text)).toBeNull();
  });

  it("rejects null and undefined", () => {
    expect(plainAgeYears(null)).toBeNull();
    expect(plainAgeYears(undefined)).toBeNull();
  });
});

describe("bornYearFromAge", () => {
  it("subtracts a plain age from the current year", () => {
    expect(bornYearFromAge("45 years old", 1495)).toBe(1450);
  });
  it("can go below zero for a long-lived character", () => {
    expect(bornYearFromAge("600", 300)).toBe(-300);
  });
  it("is null for descriptions and a non-integer year", () => {
    expect(bornYearFromAge("ancient", 1495)).toBeNull();
    expect(bornYearFromAge("45", Number.NaN)).toBeNull();
  });
});

describe("completedYears", () => {
  const today = { year: 1495, month: 6, day: 15 };
  it("uses the year difference when only a year is known", () => {
    expect(completedYears({ year: 1450, month: null, day: null }, today)).toBe(45);
  });
  it("takes one off before the birthday", () => {
    expect(completedYears({ year: 1450, month: 6, day: 16 }, today)).toBe(44);
    expect(completedYears({ year: 1450, month: 7, day: 1 }, today)).toBe(44);
  });
  it("counts the birthday itself and after it", () => {
    expect(completedYears({ year: 1450, month: 6, day: 15 }, today)).toBe(45);
    expect(completedYears({ year: 1450, month: 5, day: 30 }, today)).toBe(45);
  });
  it("ignores a lone month: without a day the birthday is unknown, so the year difference stands", () => {
    expect(completedYears({ year: 1450, month: 12, day: null }, today)).toBe(45);
    expect(completedYears({ year: 1450, month: null, day: 20 }, today)).toBe(45);
  });
  it("a child born this year is 0, not unknown", () => {
    expect(completedYears({ year: 1495, month: 6, day: 15 }, today)).toBe(0);
    expect(completedYears({ year: 1495, month: null, day: null }, today)).toBe(0);
  });
  it("is null before the birth", () => {
    expect(completedYears({ year: 1496, month: null, day: null }, today)).toBeNull();
    expect(completedYears({ year: 1495, month: 7, day: 1 }, today)).toBeNull();
  });
});

describe("promptAge", () => {
  const today = { year: 1495, month: 6, day: 15 };
  it("prefers the computed age over the free text", () => {
    expect(promptAge({ age: "ancient", born_year: 1448 }, today)).toBe("47");
  });
  it("uses the birthday when month and day are both stored", () => {
    expect(promptAge({ age: null, born_year: 1448, born_month: 12, born_day: 1 }, today)).toBe("46");
  });
  it("ignores a lone month", () => {
    expect(promptAge({ age: null, born_year: 1448, born_month: 12, born_day: null }, today)).toBe("47");
  });
  it("a row that omits born_day entirely is treated like a null one", () => {
    expect(promptAge({ age: null, born_year: 1448, born_month: 12 }, today)).toBe("47");
  });
  it("falls back to the text without a birth year or without today", () => {
    expect(promptAge({ age: " elderly " }, today)).toBe("elderly");
    expect(promptAge({ age: "elderly", born_year: 1448 }, null)).toBe("elderly");
    expect(promptAge({ age: "", born_year: null }, today)).toBeNull();
  });
});

describe("campaignToday", () => {
  it("reads a full date and refuses a partial one", () => {
    expect(campaignToday({ current_year: 1, current_month: 2, current_day: 3 })).toEqual({ year: 1, month: 2, day: 3 });
    expect(campaignToday({ current_year: 1, current_month: null, current_day: 3 })).toBeNull();
    expect(campaignToday(null)).toBeNull();
  });
});
