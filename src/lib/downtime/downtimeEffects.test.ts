import { describe, it, expect } from "vitest";
import {
  coinGain,
  coinSpend,
  unknownCoinKeys,
  effectsForCurrency,
  applyConditionEffects,
  applyHpEffects,
  describeEffect,
  hasApplicableMemberEffect,
  isAutoAppliedKind,
} from "@/lib/downtime/downtimeEffects";
import { DND5E_CURRENCY } from "@/systems/dnd5e/currency/dnd5eCurrency";
import type { CurrencyConfig } from "@/lib/currency/currency";
import type { DowntimeEffect } from "@/types/downtime.types";

function gold(over: Partial<Extract<DowntimeEffect, { kind: "gold" }>> = {}): DowntimeEffect {
  return { kind: "gold", applied: true, note: null, gain: {}, spend: {}, ...over };
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

const DOLLARS: CurrencyConfig = {
  default_key: "dollar",
  denominations: [
    { key: "dollar", name: "dollar", abbr: "$", value: 100, color: "#00aa00", makes_change: true },
    { key: "cent", name: "cent", abbr: "c", value: 1, color: "#aa7700", makes_change: true },
  ],
};

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

describe("coinGain and coinSpend", () => {
  it("sums ticked gains and ticked costs apart, per denomination", () => {
    const effects = [gold({ gain: { gp: 5, sp: 3 } }), gold({ gain: { gp: 1 }, spend: { gp: 2 } })];
    expect(coinGain(effects)).toEqual({ gp: 6, sp: 3 });
    expect(coinSpend(effects)).toEqual({ gp: 2 });
  });

  it("ignores un-ticked gold effects", () => {
    const effects = [gold({ applied: false, gain: { gp: 60 }, spend: { gp: 9 } })];
    expect(coinGain(effects)).toEqual({});
    expect(coinSpend(effects)).toEqual({});
  });

  it("ignores non-gold effects", () => {
    expect(coinGain([hp(-3), condition("Poisoned")])).toEqual({});
    expect(coinSpend([hp(-3), condition("Poisoned")])).toEqual({});
  });

  it("keeps a cost out of the gain, so a shortfall is the server's to refuse and not floored here", () => {
    expect(coinGain([gold({ spend: { gp: 25 } })])).toEqual({});
  });
});

describe("unknownCoinKeys", () => {
  it("names the coins a ticked effect uses that the campaign does not have", () => {
    expect(unknownCoinKeys([gold({ gain: { gp: 5 }, spend: { dollar: 1 } })], DOLLARS)).toEqual(["gp"]);
  });

  it("finds nothing when every coin is the campaign's own", () => {
    expect(unknownCoinKeys([gold({ gain: { dollar: 5 }, spend: { cent: 1 } })], DOLLARS)).toEqual([]);
  });

  it("does not hold an un-ticked effect against the campaign", () => {
    expect(unknownCoinKeys([gold({ applied: false, gain: { gp: 5 } })], DOLLARS)).toEqual([]);
  });
});

describe("applyHpEffects", () => {
  it("applies a ticked heal, clamped to max", () => {
    expect(applyHpEffects(5, 20, [hp(25)])).toBe(20);
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
    expect(applyHpEffects(12, 20, [gold({ gain: { gp: 5 } })])).toBe(12);
  });
});

describe("applyConditionEffects", () => {
  it("adds a ticked condition", () => {
    expect(applyConditionEffects([], [condition("Exhaustion")])).toEqual([{ name: "Exhaustion", level: 1 }]);
  });

  it("ignores un-ticked conditions", () => {
    expect(applyConditionEffects([], [condition("Poisoned", false)])).toEqual([]);
  });

  it("does not duplicate an existing condition (case-insensitive)", () => {
    expect(applyConditionEffects([{ name: "Poisoned" }], [condition("poisoned")])).toEqual([{ name: "Poisoned" }]);
  });

  it("de-duplicates two ticked effects for the same condition", () => {
    expect(applyConditionEffects([], [condition("Poisoned"), condition("Poisoned")])).toEqual([
      { name: "Poisoned" },
    ]);
  });

  it("raises an existing Exhaustion level by one per ticked effect, capped at 6", () => {
    expect(
      applyConditionEffects([{ name: "Exhaustion", level: 2 }], [condition("Exhaustion")]),
    ).toEqual([{ name: "Exhaustion", level: 3 }]);
    expect(applyConditionEffects([], [condition("Exhaustion"), condition("Exhaustion")])).toEqual([
      { name: "Exhaustion", level: 2 },
    ]);
    expect(
      applyConditionEffects([{ name: "Exhaustion", level: 6 }], [condition("Exhaustion")]),
    ).toEqual([{ name: "Exhaustion", level: 6 }]);
  });

  it("stacks Exhaustion whichever way the effect spells it", () => {
    expect(applyConditionEffects([], [condition("Exhausted")])).toEqual([{ name: "Exhaustion", level: 1 }]);
  });

  it("preserves existing conditions and appends new ones in order", () => {
    expect(
      applyConditionEffects([{ name: "Prone" }], [condition("Poisoned"), condition("Exhaustion")]),
    ).toEqual([
      { name: "Prone" },
      { name: "Poisoned" },
      { name: "Exhaustion", level: 1 },
    ]);
  });

  it("does not mutate the input array", () => {
    const conditions = [{ name: "Prone" }];
    applyConditionEffects(conditions, [condition("Poisoned")]);
    expect(conditions).toEqual([{ name: "Prone" }]);
  });
});

describe("hasApplicableMemberEffect", () => {
  it("is true when a ticked gold/hp/condition effect is present", () => {
    expect(hasApplicableMemberEffect([gold({ gain: { gp: 5 } })])).toBe(true);
    expect(hasApplicableMemberEffect([hp(-2)])).toBe(true);
    expect(hasApplicableMemberEffect([condition("Poisoned")])).toBe(true);
  });

  it("is false when the only applicable effects are un-ticked", () => {
    expect(hasApplicableMemberEffect([gold({ applied: false, gain: { gp: 5 } }), hp(-2, false)])).toBe(false);
  });

  it("is false for a ticked item effect (not applied to the member row)", () => {
    expect(hasApplicableMemberEffect([item(true)])).toBe(false);
  });

  it("is false for an empty list", () => {
    expect(hasApplicableMemberEffect([])).toBe(false);
  });
});

describe("describeEffect", () => {
  it("lists only the coins that move, and says so when none do", () => {
    expect(describeEffect(gold({ gain: { gp: 60 }, spend: { sp: 3 } }), DND5E_CURRENCY)).toBe("+60 gp, -3 sp");
    expect(describeEffect(gold(), DND5E_CURRENCY)).toBe("no coin");
  });

  it("words a cost in the campaign's own coins", () => {
    expect(describeEffect(gold({ spend: { dollar: 5, cent: 20 } }), DOLLARS)).toBe("-5 $ 20 c");
  });

  it("signs a heal and leaves an injury's own minus", () => {
    expect(describeEffect(hp(4), DND5E_CURRENCY)).toBe("+4 HP");
    expect(describeEffect(hp(-4), DND5E_CURRENCY)).toBe("-4 HP");
  });

  it("names a condition", () => {
    expect(describeEffect(condition("Poisoned"), DND5E_CURRENCY)).toBe("Poisoned");
  });
});

describe("effectsForCurrency", () => {
  it("drops a 5e-priced seed's gold effect in a dollar campaign, so ticking it cannot fail (bug: seed cards erroring outside 5e)", () => {
    expect(effectsForCurrency([gold({ gain: { gp: 5 } }), hp(2, false)], DOLLARS)).toEqual([hp(2, false)]);
  });
  it("keeps a gold effect in coins the campaign has", () => {
    expect(effectsForCurrency([gold({ gain: { gp: 5 } })], DND5E_CURRENCY)).toHaveLength(1);
  });
});
