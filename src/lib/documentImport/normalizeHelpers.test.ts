import { describe, it, expect } from "vitest";
import { capProse, resolveEnum } from "@/lib/documentImport/normalize";
import { PROSE_FIELD_LIMIT } from "@/types/documentImport.types";
import { ITEM_RARITIES } from "@/types/item.types";
import { MONSTER_TYPES } from "@/types/monster.types";

/**
 * Tests for the two text helpers `normalize.ts` shares across all seven
 * mappers. Split out from `normalize.test.ts` because these cover a different
 * thing: the mapper tests assert a payload becomes the right row, while these
 * assert the two primitives every one of those mappers leans on. That split is
 * also what keeps each file under the 600-line soft max without halving the
 * mapper suite along some arbitrary line.
 */

describe("capProse", () => {
  it("returns null for undefined input", () => {
    expect(capProse(undefined)).toBeNull();
  });

  it("returns null for blank/whitespace-only input", () => {
    expect(capProse("   ")).toBeNull();
  });

  it("passes short text through unchanged", () => {
    expect(capProse("A grim tower on a windswept crag.")).toBe("A grim tower on a windswept crag.");
  });

  it("truncates text over the limit on a word boundary with an ellipsis", () => {
    const word = "grimoire ";
    const long = word.repeat(120).trim(); // 9 * 120 - 1 = 1079 chars, well over 600
    expect(long.length).toBeGreaterThan(PROSE_FIELD_LIMIT);

    const result = capProse(long);
    expect(result).not.toBeNull();
    const capped = result as string;

    // Never chops mid-word: the character right before the ellipsis is either
    // the end of the original string or a full "grimoire" token boundary.
    expect(capped.endsWith("…")).toBe(true);
    const withoutEllipsis = capped.slice(0, -1);
    expect(withoutEllipsis.length).toBeLessThanOrEqual(PROSE_FIELD_LIMIT);
    expect(long.startsWith(withoutEllipsis)).toBe(true);
    expect(withoutEllipsis.endsWith(" ")).toBe(false); // trimmed at the boundary, not mid-token
    // The character in the source immediately after the kept text is a space
    // (or end of string) — proof the cut landed on a word boundary.
    const nextChar = long[withoutEllipsis.length];
    expect(nextChar === " " || nextChar === undefined).toBe(true);
  });

  it("respects a custom limit", () => {
    expect(capProse("one two three four", 7)).toBe("one…");
  });
});

// ── resolveEnum ──────────────────────────────────────────────────────────────

describe("resolveEnum", () => {
  const SIZES = ["tiny", "small", "medium", "large", "huge", "gargantuan"] as const;

  it("matches a candidate by case-insensitive substring", () => {
    expect(resolveEnum("Large fiend (demon)", SIZES, "medium")).toBe("large");
  });

  it("falls back to the default when nothing matches", () => {
    expect(resolveEnum("some unrecognizable garbage text", SIZES, "medium")).toBe("medium");
  });

  it("falls back to the default when input is undefined", () => {
    expect(resolveEnum(undefined, SIZES, "medium")).toBe("medium");
  });

  it("matches underscored candidates against their space-separated form", () => {
    const rarities = ["mundane", "very_rare", "legendary"] as const;
    expect(resolveEnum("This is a Very Rare item.", rarities, "mundane")).toBe("very_rare");
  });
});

describe("resolveEnum — overlapping candidates", () => {
  // Regression: the first-match implementation returned the first candidate the
  // haystack contained, and several 5e vocabularies nest one term inside
  // another. "uncommon" contains "common"; "very rare" contains "rare". A
  // first-match scan therefore downgraded every Very Rare item to Rare and
  // every Uncommon item to Common — silently, with no error and no empty field
  // for a reviewing DM to notice. Longest-match is what makes these correct.
  it("prefers the longest matching candidate, not the first", () => {
    expect(resolveEnum("Uncommon", ITEM_RARITIES, "mundane")).toBe("uncommon");
    expect(resolveEnum("Very Rare", ITEM_RARITIES, "mundane")).toBe("very_rare");
    expect(resolveEnum("Rare", ITEM_RARITIES, "mundane")).toBe("rare");
    expect(resolveEnum("Common", ITEM_RARITIES, "mundane")).toBe("common");
  });

  it("still resolves a plain single match and falls back on nonsense", () => {
    expect(resolveEnum("Large fiend (demon)", MONSTER_TYPES, "humanoid")).toBe("fiend");
    expect(resolveEnum("Legendary", ITEM_RARITIES, "mundane")).toBe("legendary");
    expect(resolveEnum("qwertyuiop", ITEM_RARITIES, "mundane")).toBe("mundane");
  });
});
