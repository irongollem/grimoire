import { describe, expect, it } from "vitest";
import { castableBy, castLimitOf, slotLimitAt, spellKey } from "./castLimit.ts";
import { mageBlock } from "./spellTestKit.ts";
import type { ProseSpellGroup } from "../../statBlock/spellcastingProse.ts";

const group = (frequency: ProseSpellGroup["frequency"]): ProseSpellGroup => ({ frequency, spells: [] });

describe("castLimitOf", () => {
  // SRD 5.1 night hag "2/day each: plane shift": that spell twice, tallied under its own name.
  it("fails if an N/day spell is not tallied under its own name with N casts", () => {
    expect(castLimitOf(group({ kind: "per_day", count: 2, each: true }), "Plane  Shift")).toEqual({ useKey: "spell/plane shift", limit: { per_day: 2 } });
  });

  // SRD 5.1 mage "3rd level (3 slots)": three casts shared by every spell of that level, so the key is the level, not the spell.
  it("fails if two spells of one slot level are tallied apart, or the slots are counted as the spell level", () => {
    const slots = group({ kind: "slots", level: 3, slots: 3 });
    expect(castLimitOf(slots, "fireball")).toEqual({ useKey: "slots/3", limit: { per_day: 3 } });
    expect(castLimitOf(slots, "counterspell")).toEqual({ useKey: "slots/3", limit: { per_day: 3 } });
  });

  // SRD 5.1 "Cantrips (at will)" and "At will:": unlimited.
  it("fails if at will or a cantrip is given a limit", () => {
    expect(castLimitOf(group({ kind: "at_will" }), "light")).toEqual({ useKey: null, limit: null });
    expect(castLimitOf(group({ kind: "cantrips" }), "light")).toEqual({ useKey: null, limit: null });
  });
});

describe("castableBy", () => {
  // SRD 5.1 mage: fireball is listed under 3rd level (3 slots), and the header gives DC 14, +6, 9th level.
  it("fails if the header numbers or the slot group of a listed spell are lost", () => {
    expect(castableBy(mageBlock(), "Fireball")).toMatchObject({
      saveDc: 14, attackBonus: 6, casterLevel: 9, useKey: "slots/3", limit: { per_day: 3 }, level: 3,
    });
  });

  it("fails if a cantrip is not level 0, or an at will spell is given a slot level", () => {
    expect(castableBy(mageBlock(), "fire bolt")).toMatchObject({ level: 0, useKey: null, limit: null });
  });

  it("fails if a spell the creature does not list is reported castable", () => {
    expect(castableBy(mageBlock(), "disintegrate")).toBeNull();
    expect(castableBy({ ...mageBlock(), special_abilities: [] }, "fireball")).toBeNull();
  });
});

describe("slotLimitAt", () => {
  // SRD 5.1 mage "4th level (3 slots)": a fireball upcast to 4th spends those slots.
  it("fails if an upcast finds no slots, or slots of the wrong level", () => {
    expect(slotLimitAt(mageBlock(), 4)).toEqual({ useKey: "slots/4", limit: { per_day: 3 } });
    expect(slotLimitAt(mageBlock(), 5)).toBeNull();
  });
});

describe("spellKey", () => {
  it("fails if letter case or doubled spaces make one spell two keys", () => {
    expect(spellKey("  Hold   Person ")).toBe("hold person");
  });
});
