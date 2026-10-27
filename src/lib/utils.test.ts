import { afterEach, describe, it, expect, vi } from "vitest";
import {
  abilityModifier,
  carryCapacity,
  chunkArray,
  cn,
  deepEqual,
  extractTiptapText,
  formatHitPoints,
  formatWeightLb,
  parseCr,
  parseSpeed,
  parseWeightLb,
  pluralizeCount,
  skillsToRecord,
  skillsToString,
  speedToString,
  timeAgo,
} from "./utils";

describe("cn", () => {
  // The #552 typography roles are custom `@utility` classes, so stock
  // tailwind-merge does not recognise them as font sizes and would let a
  // component default and a call-site override both survive. AppButton's
  // `class` passthrough depends on these winning cleanly.
  it("lets a call-site font size replace a semantic typography role", () => {
    expect(cn("text-label-lg px-3", "text-sm")).toBe("px-3 text-sm");
  });

  it("resolves one typography role against another", () => {
    expect(cn("text-label", "text-label-lg")).toBe("text-label-lg");
    expect(cn("text-body", "text-caption-sm")).toBe("text-caption-sm");
  });

  it("leaves non-conflicting classes alone", () => {
    expect(cn("text-label-lg px-3", "px-4")).toBe("text-label-lg px-4");
  });

  it("still resolves ordinary Tailwind conflicts", () => {
    expect(cn("bg-primary", "bg-muted")).toBe("bg-muted");
  });
});

describe("deepEqual", () => {
  it("treats identical primitives as equal", () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual("a", "a")).toBe(true);
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual(undefined, undefined)).toBe(true);
  });

  it("treats different primitives as unequal", () => {
    expect(deepEqual(1, 2)).toBe(false);
    expect(deepEqual("a", "b")).toBe(false);
    expect(deepEqual(null, undefined)).toBe(false);
    expect(deepEqual(0, false)).toBe(false);
  });

  it("is insensitive to object key order", () => {
    const a = { name: "Owlbear", cr: "3", tags: ["beast"] };
    const b = { tags: ["beast"], cr: "3", name: "Owlbear" };
    expect(deepEqual(a, b)).toBe(true);
  });

  it("detects a changed nested value", () => {
    const a = { stat_block: { armor_class: 13, hit_points: "10 (2d8+1)" } };
    const b = { stat_block: { armor_class: 15, hit_points: "10 (2d8+1)" } };
    expect(deepEqual(a, b)).toBe(false);
  });

  it("compares arrays by content and order", () => {
    expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(deepEqual([1, 2, 3], [3, 2, 1])).toBe(false);
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
  });

  it("distinguishes an array from an object", () => {
    expect(deepEqual([1, 2], { 0: 1, 1: 2 })).toBe(false);
  });

  it("detects an added or removed key", () => {
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(deepEqual({ a: 1, b: undefined }, { a: 1 })).toBe(false);
  });

});

describe("extractTiptapText", () => {
  it("reads the text out of Tiptap JSON", () => {
    const doc = JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Frost rimes every surface." }] }] });
    expect(extractTiptapText(doc)).toBe("Frost rimes every surface.");
  });

  it("strips the tags off an HTML description instead of printing them", () => {
    expect(extractTiptapText("<p>Frost rimes <em>every</em> surface.</p>", 60)).toBe("Frost rimes every surface.");
    expect(extractTiptapText("<p></p>", 1)).toBe("");
  });
});

describe("chunkArray", () => {
  it("splits into groups of the given size, with a shorter final group", () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns one chunk when everything fits", () => {
    expect(chunkArray(["a", "b"], 200)).toEqual([["a", "b"]]);
  });

  it("returns no chunks for an empty input", () => {
    expect(chunkArray([], 200)).toEqual([]);
  });

  it("chunks exactly on a multiple of the size, with no trailing empty chunk", () => {
    expect(chunkArray([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
  });
});

describe("pluralizeCount", () => {
  it("uses the singular for a count of one", () => {
    expect(pluralizeCount(1, "item")).toBe("1 item");
  });

  it("naively pluralises with a trailing 's' by default", () => {
    expect(pluralizeCount(0, "item")).toBe("0 items");
    expect(pluralizeCount(3, "item")).toBe("3 items");
  });

  it("uses the supplied irregular plural instead of the naive one", () => {
    expect(pluralizeCount(2, "species", "species")).toBe("2 species");
    expect(pluralizeCount(1, "species", "species")).toBe("1 species");
  });
});

// 5e rules and conventions below. PHB 2014 "Ability Scores and Modifiers":
// modifier = (score - 10) / 2, rounded down.
describe("abilityModifier", () => {
  it.each([
    [1, "-5"],
    [8, "-1"],
    [9, "-1"],
    [10, "+0"],
    [11, "+0"],
    [12, "+1"],
    [20, "+5"],
    [30, "+10"],
  ])("a score of %i gives %s", (score, modifier) => {
    expect(abilityModifier(score)).toBe(modifier);
  });
});

// PHB 2014 "Variant: Encumbrance" / "Lifting and Carrying": capacity is 15 x
// Strength, and a Powerful Build counts as one size larger, which doubles it.
// A DM override is absolute, or a multiplier / increase / decrease written
// "*2", "+30", "-30" (app convention).
describe("carryCapacity", () => {
  it("is 15 pounds per point of Strength, doubled for a powerful build", () => {
    expect(carryCapacity(10, "Human", null)).toBe(150);
    expect(carryCapacity(10, "Goliath", null)).toBe(300);
    expect(carryCapacity(10, null, null)).toBe(150);
  });

  it.each([
    ["*2", 300],
    ["+30", 180],
    ["-30", 120],
    ["500", 500],
    ["  +30  ", 180],
  ])("applies the override %j to a base of 150", (override, expected) => {
    expect(carryCapacity(10, "Human", override)).toBe(expected);
  });

  it("ignores an override it cannot read, and a blank one", () => {
    expect(carryCapacity(10, "Human", "lots")).toBe(150);
    expect(carryCapacity(10, "Human", "*x")).toBe(150);
    expect(carryCapacity(10, "Human", "   ")).toBe(150);
  });
});

describe("parseWeightLb", () => {
  it("reads numbers, unit-suffixed text and fractions, and is 0 when it cannot", () => {
    expect(parseWeightLb(5)).toBe(5);
    expect(parseWeightLb("2.5 lb.")).toBe(2.5);
    expect(parseWeightLb("10 lbs")).toBe(10);
    expect(parseWeightLb("1/2 lb")).toBe(0.5);
    expect(parseWeightLb("1/0")).toBe(0);
    expect(parseWeightLb("heavy")).toBe(0);
    expect(parseWeightLb(null)).toBe(0);
    expect(parseWeightLb(undefined)).toBe(0);
  });
});

describe("formatWeightLb", () => {
  it("drops the decimal on a whole weight and keeps one place otherwise", () => {
    expect(formatWeightLb(3)).toBe("3 lb");
    expect(formatWeightLb(2.5)).toBe("2.5 lb");
  });
});

describe("formatHitPoints", () => {
  // MM 2014 stat block: average = dice x (die + 1) / 2 + bonus, rounded down.
  it("adds the average to bare hit dice", () => {
    expect(formatHitPoints("2d8+1")).toBe("10 (2d8+1)");
    expect(formatHitPoints("3d6")).toBe("10 (3d6)");
    expect(formatHitPoints("4d10-4")).toBe("18 (4d10-4)");
  });

  it("leaves an already-averaged value alone, and marks a missing one", () => {
    expect(formatHitPoints("27 (6d6 + 6)")).toBe("27 (6d6 + 6)");
    expect(formatHitPoints("7")).toBe("7");
    expect(formatHitPoints(null)).toBe("—");
    expect(formatHitPoints("")).toBe("—");
  });
});

describe("parseCr", () => {
  it("reads whole and fractional ratings, and is 0 for none", () => {
    expect(parseCr("5")).toBe(5);
    expect(parseCr("1/4")).toBe(0.25);
    expect(parseCr("0")).toBe(0);
    expect(parseCr(null)).toBe(0);
    expect(parseCr("???")).toBe(0);
  });
});

describe("speed text", () => {
  it("writes a speed block the way a stat block prints it", () => {
    expect(speedToString({ walk: 30, fly: 60, hover: true, swim: 20 })).toBe("30 ft., fly 60 ft. (hover), swim 20 ft.");
    expect(speedToString({ climb: 30, burrow: 10 })).toBe("climb 30 ft., burrow 10 ft.");
    expect(speedToString({})).toBe("0 ft.");
    expect(speedToString(null)).toBe("0 ft.");
    expect(speedToString("30 ft.")).toBe("30 ft.");
  });

  it("reads printed speed text back into the block it came from", () => {
    const block = { walk: 30, fly: 60, hover: true, swim: 20, climb: 15, burrow: 10 };
    expect(parseSpeed(speedToString(block))).toEqual(block);
  });

  it("defaults to a 30 ft. walk when there is nothing readable", () => {
    expect(parseSpeed(null)).toEqual({ walk: 30 });
    expect(parseSpeed("fast")).toEqual({ walk: 30 });
  });
});

describe("skills text", () => {
  it("writes skills with spaces and reads them back with underscores", () => {
    const record = { sleight_of_hand: "+5", stealth: "+7" };
    expect(skillsToString(record)).toBe("sleight of hand +5, stealth +7");
    expect(skillsToRecord("sleight of hand +5, stealth +7")).toEqual(record);
  });

  it("skips an entry without a signed bonus", () => {
    expect(skillsToRecord("stealth +7, perception")).toEqual({ stealth: "+7" });
  });
});

describe("timeAgo", () => {
  afterEach(() => vi.useRealTimers());
  const NOW = new Date("2026-10-27T12:00:00Z");
  const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

  it.each([
    [30_000, "just now"],
    [60_000, "1m ago"],
    [59 * 60_000, "59m ago"],
    [60 * 60_000, "1h ago"],
    [23 * 3_600_000, "23h ago"],
    [24 * 3_600_000, "1d ago"],
    [29 * 86_400_000, "29d ago"],
  ])("reads %i ms as %s", (ms, label) => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    expect(timeAgo(ago(ms))).toBe(label);
  });

  it("falls back to a date after thirty days", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    expect(timeAgo(ago(30 * 86_400_000))).not.toMatch(/ago$/);
  });
});
