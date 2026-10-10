import { describe, expect, it } from "vitest";
import { emptyDefenses } from "@/types/statBlock.types";
import { applyDefenses, damageRollsFor } from "./typedDamage.ts";

describe("damageRollsFor", () => {
  it("doubles dice not modifier on a crit", () => {
    const [r] = damageRollsFor([{ dice: "2d6+3", type: "slashing" }], true);
    expect(r.parsed).toEqual({ terms: [{ count: 4, sides: 6 }], modifier: 3 });
  });
  it("leaves dice alone without a crit", () => {
    expect(damageRollsFor([{ dice: "1d8", type: "fire" }], false)[0].parsed.terms).toEqual([{ count: 1, sides: 8 }]);
  });
  it("flat damage has no dice", () => {
    const [r] = damageRollsFor([{ dice: "1", type: null }], true);
    expect(r.parsed).toEqual({ terms: [], modifier: 1 });
  });
  it("throws on garbage", () => {
    expect(() => damageRollsFor([{ dice: "lots", type: "fire" }], false)).toThrow(/lots/);
  });
});

describe("applyDefenses", () => {
  const d = emptyDefenses();
  it("no defenses leaves amounts", () => {
    const r = applyDefenses({ parts: [{ amount: 7, type: "fire" }], defenses: d });
    expect(r.total).toBe(7);
    expect(r.parts[0].applied).toBeNull();
  });
  it("resistance halves rounding down", () => {
    const r = applyDefenses({ parts: [{ amount: 7, type: "fire" }], defenses: { ...d, resistances: [{ types: ["fire"] }] } });
    expect(r.total).toBe(3);
    expect(r.parts[0]).toMatchObject({ applied: "resistant", rolled: 7 });
  });
  it("vulnerability doubles", () => {
    expect(applyDefenses({ parts: [{ amount: 7, type: "cold" }], defenses: { ...d, vulnerabilities: [{ types: ["cold"] }] } }).total).toBe(14);
  });
  it("resistant and vulnerable: halve then double", () => {
    const r = applyDefenses({
      parts: [{ amount: 7, type: "fire" }],
      defenses: { ...d, resistances: [{ types: ["fire"] }], vulnerabilities: [{ types: ["fire"] }] },
    });
    expect(r.total).toBe(6);
    expect(r.parts[0].applied).toBe("resistant+vulnerable");
  });
  it("duplicate resistances count once", () => {
    const r = applyDefenses({ parts: [{ amount: 8, type: "fire" }], defenses: { ...d, resistances: [{ types: ["fire"] }, { types: ["fire", "cold"] }] } });
    expect(r.total).toBe(4);
  });
  it("unless magical: bypassed by magical", () => {
    const defenses = { ...d, resistances: [{ types: ["slashing" as const], unless: ["magical" as const] }] };
    expect(applyDefenses({ parts: [{ amount: 10, type: "slashing" }], defenses }).total).toBe(5);
    expect(applyDefenses({ parts: [{ amount: 10, type: "slashing" }], defenses, properties: ["magical"] }).total).toBe(10);
    expect(applyDefenses({ parts: [{ amount: 10, type: "slashing" }], defenses, properties: ["silvered"] }).total).toBe(5);
  });
  it("immunity zeroes a rider but not the main hit", () => {
    const r = applyDefenses({
      parts: [{ amount: 9, type: "piercing" }, { amount: 7, type: "poison" }],
      defenses: { ...d, immunities: [{ types: ["poison"] }] },
    });
    expect(r.total).toBe(9);
    expect(r.parts[1]).toMatchObject({ amount: 0, applied: "immune", rolled: 7 });
  });
  it("immunity beats vulnerability", () => {
    const r = applyDefenses({
      parts: [{ amount: 5, type: "fire" }],
      defenses: { ...d, immunities: [{ types: ["fire"] }], vulnerabilities: [{ types: ["fire"] }] },
    });
    expect(r.total).toBe(0);
  });
  it("untyped parts take no defenses", () => {
    const r = applyDefenses({ parts: [{ amount: 5, type: null }], defenses: { ...d, resistances: [{ types: ["fire"] }] } });
    expect(r.total).toBe(5);
  });
  it("surfaces a defense note and still applies it", () => {
    const r = applyDefenses({
      parts: [{ amount: 6, type: "radiant" }],
      defenses: { ...d, resistances: [{ types: ["radiant"], note: "while in dim light" }], notes: "damage from spells" },
    });
    expect(r.parts[0]).toMatchObject({ amount: 3, note: "while in dim light" });
    expect(r.notes).toEqual(["damage from spells"]);
  });
});
