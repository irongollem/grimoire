import { describe, it, expect } from "vitest";
import {
  applyCoinEffects,
  applyConditionEffects,
  applyHpEffects,
  hasApplicableMemberEffect,
  isAutoAppliedKind,
} from "@/lib/downtime/downtimeEffects";
import type { DowntimeEffect } from "@/types/downtime.types";

function gold(over: Partial<Extract<DowntimeEffect, { kind: "gold" }>> = {}): DowntimeEffect {
  return { kind: "gold", applied: true, note: null, cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, ...over };
}
function hp(delta: number, applied = true): DowntimeEffect {
  return { kind: "hp", applied, note: null, delta };
}
function condition(name: string, applied = true): DowntimeEffect {
  return { kind: "condition", applied, note: null, condition: name };
}
function item(applied = true): DowntimeEffect {
  return { kind: "item", applied, note: null, item_id: "i1", qty: 1 };
}

const ZERO = { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };

describe("isAutoAppliedKind", () => {
  it("auto-applies gold, hp, and condition", () => {
    expect(isAutoAppliedKind("gold")).toBe(true);
    expect(isAutoAppliedKind("hp")).toBe(true);
    expect(isAutoAppliedKind("condition")).toBe(true);
  });

  it("does not auto-apply item", () => {
    expect(isAutoAppliedKind("item")).toBe(false);
  });
});

describe("applyCoinEffects", () => {
  it("adds a ticked gold effect to the purse", () => {
    expect(applyCoinEffects(ZERO, [gold({ gp: 60 })])).toEqual({ ...ZERO, gp: 60 });
  });

  it("ignores un-ticked gold effects", () => {
    expect(applyCoinEffects({ ...ZERO, gp: 10 }, [gold({ applied: false, gp: 60 })])).toEqual({
      ...ZERO,
      gp: 10,
    });
  });

  it("ignores non-gold effects", () => {
    expect(applyCoinEffects({ ...ZERO, gp: 5 }, [hp(-3), condition("Poisoned")])).toEqual({
      ...ZERO,
      gp: 5,
    });
  });

  it("never lets a coin column go negative", () => {
    expect(applyCoinEffects({ ...ZERO, gp: 5 }, [gold({ gp: -25 })])).toEqual({ ...ZERO, gp: 0 });
  });

  it("sums multiple ticked gold effects across columns", () => {
    const out = applyCoinEffects({ ...ZERO, gp: 10 }, [gold({ gp: 5, sp: 3 }), gold({ gp: -2 })]);
    expect(out).toEqual({ ...ZERO, gp: 13, sp: 3 });
  });

  it("does not mutate the input", () => {
    const coins = { ...ZERO, gp: 10 };
    applyCoinEffects(coins, [gold({ gp: 5 })]);
    expect(coins.gp).toBe(10);
  });
});

describe("applyHpEffects", () => {
  it("applies a ticked heal, clamped to max", () => {
    expect(applyHpEffects(5, 20, [hp(15)])).toBe(20);
  });

  it("applies a ticked injury, clamped to zero", () => {
    expect(applyHpEffects(4, 20, [hp(-12)])).toBe(0);
  });

  it("ignores un-ticked hp effects", () => {
    expect(applyHpEffects(10, 20, [hp(-5, false)])).toBe(10);
  });

  it("sums multiple ticked hp effects", () => {
    expect(applyHpEffects(10, 30, [hp(-6), hp(2)])).toBe(6);
  });

  it("leaves hp untouched when no hp effect is present", () => {
    expect(applyHpEffects(12, 20, [gold({ gp: 5 })])).toBe(12);
  });
});

describe("applyConditionEffects", () => {
  it("adds a ticked condition", () => {
    expect(applyConditionEffects([], [condition("Exhaustion")])).toEqual(["Exhaustion"]);
  });

  it("ignores un-ticked conditions", () => {
    expect(applyConditionEffects([], [condition("Poisoned", false)])).toEqual([]);
  });

  it("does not duplicate an existing condition (case-insensitive)", () => {
    expect(applyConditionEffects(["Poisoned"], [condition("poisoned")])).toEqual(["Poisoned"]);
  });

  it("de-duplicates two ticked effects for the same condition", () => {
    expect(applyConditionEffects([], [condition("Exhaustion"), condition("Exhaustion")])).toEqual([
      "Exhaustion",
    ]);
  });

  it("preserves existing conditions and appends new ones in order", () => {
    expect(
      applyConditionEffects(["Prone"], [condition("Poisoned"), condition("Exhaustion")]),
    ).toEqual(["Prone", "Poisoned", "Exhaustion"]);
  });

  it("does not mutate the input array", () => {
    const conditions = ["Prone"];
    applyConditionEffects(conditions, [condition("Poisoned")]);
    expect(conditions).toEqual(["Prone"]);
  });
});

describe("hasApplicableMemberEffect", () => {
  it("is true when a ticked gold/hp/condition effect is present", () => {
    expect(hasApplicableMemberEffect([gold({ gp: 5 })])).toBe(true);
    expect(hasApplicableMemberEffect([hp(-2)])).toBe(true);
    expect(hasApplicableMemberEffect([condition("Poisoned")])).toBe(true);
  });

  it("is false when the only applicable effects are un-ticked", () => {
    expect(hasApplicableMemberEffect([gold({ applied: false, gp: 5 }), hp(-2, false)])).toBe(false);
  });

  it("is false for a ticked item effect (not applied to the member row)", () => {
    expect(hasApplicableMemberEffect([item(true)])).toBe(false);
  });

  it("is false for an empty list", () => {
    expect(hasApplicableMemberEffect([])).toBe(false);
  });
});
