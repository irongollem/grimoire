import { describe, expect, it } from "vitest";
import { attackSummary } from "./attackLabel";
import type { PcAttackRow } from "@/composables/encounters/usePcAttackRows";

const row = (over: Partial<PcAttackRow>): PcAttackRow => ({
  key: "k",
  name: "Shortsword",
  baseDice: null,
  modifier: 0,
  shape: null,
  damageType: "piercing",
  kind: "melee",
  attackBonus: 7,
  damageDice: "1d8+4",
  damageFixed: null,
  description: "",
  ammoTag: null,
  weaponInvId: null,
  ...over,
});

describe("attackSummary", () => {
  // Bug caught: the dice shown as the raw "1d8+4" the rows carry, or the to-hit bonus without its sign.
  it("reads bonus, spaced damage and type", () => {
    expect(attackSummary(row({}))).toBe("+7 to hit · 1d8 + 4 piercing");
  });

  // Bug caught: a negative bonus or modifier printed as "+-1" or "-1" without the spacing.
  it("writes negatives as minus", () => {
    expect(attackSummary(row({ attackBonus: -1, damageDice: "1d6-1", damageType: "bludgeoning" }))).toBe("-1 to hit · 1d6 - 1 bludgeoning");
  });

  // Bug caught: "1d8 + 0" shown when the modifier is zero.
  it("leaves out a zero modifier", () => {
    expect(attackSummary(row({ damageDice: "1d8+0" }))).toBe("+7 to hit · 1d8 piercing");
  });

  // Bug caught: an unarmed strike's flat damage run through the dice formatter or dropped.
  it("shows fixed damage as given", () => {
    expect(attackSummary(row({ attackBonus: 5, damageDice: null, damageFixed: "2 bludgeoning" }))).toBe("+5 to hit · 2 bludgeoning");
  });

  // Bug caught: a custom attack with nothing to roll printing "null to hit" or a dangling separator.
  it("leaves out the parts a row does not have", () => {
    expect(attackSummary(row({ attackBonus: null, damageDice: "2d6", damageType: "fire" }))).toBe("2d6 fire");
    expect(attackSummary(row({ attackBonus: null, damageDice: null, damageFixed: null }))).toBe("");
  });

  // Bug caught: a multi-die expression losing its first die when the trailing modifier is split off.
  it("keeps every die of a compound expression", () => {
    expect(attackSummary(row({ damageDice: "1d8+1d6+3" }))).toBe("+7 to hit · 1d8+1d6 + 3 piercing");
  });
});
