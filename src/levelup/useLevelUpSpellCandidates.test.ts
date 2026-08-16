import { describe, it, expect } from "vitest";
import { pickSpellCandidates } from "./useLevelUpSpellCandidates";
import type { Spell } from "@/types/spell.types";

function spell(partial: Partial<Spell> & { id: string; name: string; level: number }): Spell {
  return {
    school: "evocation",
    classes: ["Wizard"],
    ...partial,
  } as Spell;
}

const LIBRARY = [
  spell({ id: "srd_light", name: "Light", level: 0, classes: ["Wizard", "Cleric"] }),
  spell({ id: "srd_guidance", name: "Guidance", level: 0, classes: ["Cleric"] }),
  spell({ id: "srd_magic_missile", name: "Magic Missile", level: 1, classes: ["Wizard"] }),
  spell({ id: "srd_cure_wounds", name: "Cure Wounds", level: 1, classes: ["Cleric"] }),
  spell({ id: "srd_fireball", name: "Fireball", level: 3, classes: ["Wizard"] }),
];

describe("pickSpellCandidates", () => {
  it("offers only castable, class-appropriate spells", () => {
    const { spells, usedClassFallback } = pickSpellCandidates(LIBRARY, {
      className: "Wizard",
      search: "",
      isCantrip: false,
      maxCastableLevel: 1,
    });

    expect(spells.map((s) => s.id)).toEqual(["srd_magic_missile"]);
    expect(usedClassFallback).toBe(false);
  });

  it("offers only cantrips for the cantrip picker, ignoring the slot ceiling", () => {
    const { spells } = pickSpellCandidates(LIBRARY, {
      className: "Cleric",
      search: "",
      isCantrip: true,
      maxCastableLevel: 1,
    });

    expect(spells.map((s) => s.id)).toEqual(["srd_light", "srd_guidance"]);
  });

  it("falls back to the full list when no library spell lists the class", () => {
    // A DM-built custom class appears in no library spell's `classes` array.
    // Filtering it to nothing would leave the wizard demanding picks from an
    // empty list, and apply_level_up rejects a short submission — the level-up
    // could never be confirmed (#736).
    const { spells, usedClassFallback } = pickSpellCandidates(LIBRARY, {
      className: "Bloodhunter",
      search: "",
      isCantrip: false,
      maxCastableLevel: 3,
    });

    expect(usedClassFallback).toBe(true);
    expect(spells.map((s) => s.id)).toEqual([
      "srd_magic_missile",
      "srd_cure_wounds",
      "srd_fireball",
    ]);
  });

  it("reports no results rather than widening the class when a search matches nothing", () => {
    const { spells, available, usedClassFallback } = pickSpellCandidates(LIBRARY, {
      className: "Wizard",
      search: "cure",
      isCantrip: false,
      maxCastableLevel: 9,
    });

    expect(spells).toEqual([]);
    expect(usedClassFallback).toBe(false);
    // `available` ignores the search box, so the wizard shows "no match" rather
    // than the far more alarming "no spell library is available".
    expect(available).toBe(2);
  });

  it("reports zero available when the class has no castable spell of any level", () => {
    const { spells, available, usedClassFallback } = pickSpellCandidates(
      [spell({ id: "srd_light", name: "Light", level: 0, classes: ["Wizard"] })],
      { className: "Wizard", search: "", isCantrip: false, maxCastableLevel: 9 },
    );

    expect(spells).toEqual([]);
    expect(available).toBe(0);
    expect(usedClassFallback).toBe(false);
  });

  it("matches the search term case-insensitively within the class list", () => {
    const { spells } = pickSpellCandidates(LIBRARY, {
      className: "Wizard",
      search: "  FIRE ",
      isCantrip: false,
      maxCastableLevel: 9,
    });

    expect(spells.map((s) => s.id)).toEqual(["srd_fireball"]);
  });

  it("does not claim a class fallback when the library itself is empty", () => {
    // Nothing to fall back to — the wizard must say why it is stuck instead of
    // implying the class filter was the problem.
    const { spells, available, usedClassFallback } = pickSpellCandidates([], {
      className: "Wizard",
      search: "",
      isCantrip: false,
      maxCastableLevel: 9,
    });

    expect(spells).toEqual([]);
    expect(available).toBe(0);
    expect(usedClassFallback).toBe(false);
  });

  it("offers every castable spell when the class is not yet resolved", () => {
    const { spells, usedClassFallback } = pickSpellCandidates(LIBRARY, {
      className: "",
      search: "",
      isCantrip: false,
      maxCastableLevel: 1,
    });

    expect(spells.map((s) => s.id)).toEqual(["srd_magic_missile", "srd_cure_wounds"]);
    expect(usedClassFallback).toBe(false);
  });
});
