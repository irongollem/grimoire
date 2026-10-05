import { describe, expect, it } from "vitest";
import { parseMechanics } from "@/rules/features/mechanics";
import { AMOUNT_KINDS, PICK_KINDS, RIDER_DICE_KINDS, amountOfKind, newChoice, newRider, newSubAction, newToggle, newUses, pickOfKind, riderDiceOfKind, tidyMechanics, withPart } from "./mechanicsDraft";

describe("defaults", () => {
  it("every amount kind starts as something the parser accepts", () => {
    for (const { value } of AMOUNT_KINDS) {
      const { errors } = parseMechanics({ uses: { ...newUses(), key: "k", label: "K", amount: amountOfKind(value) } });
      expect(errors, value).toEqual([]);
    }
  });

  it("every pick and rider dice kind starts valid", () => {
    for (const { value } of PICK_KINDS) {
      // A custom list is empty until the DM types options, and says so.
      const expected = value === "custom" ? 1 : 0;
      expect(parseMechanics({ choices: [{ ...newChoice(), key: "k", label: "K", pick: pickOfKind(value) }] }).errors, value).toHaveLength(expected);
    }
    for (const { value } of RIDER_DICE_KINDS) {
      expect(parseMechanics({ riders: [{ ...newRider(), label: "R", dice: value === "fixed" ? { kind: "fixed", expression: "1d6" } : riderDiceOfKind(value) }] }).errors, value).toEqual([]);
    }
  });

  it("a new toggle and sub-action are valid once named", () => {
    expect(parseMechanics({ toggle: { ...newToggle(), key: "raging", label: "Raging" } }).errors).toEqual([]);
    expect(parseMechanics({ actions: [{ ...newSubAction(), name: "Dash" }] }).errors).toEqual([]);
  });

  it("a blank uses is reported, not silently dropped by the editor", () => {
    expect(parseMechanics({ uses: newUses() }).errors.length).toBeGreaterThan(0);
  });
});

describe("withPart and tidyMechanics", () => {
  it("sets and removes a part without touching the others", () => {
    const m = withPart({ activation: "action" }, "uses", newUses());
    expect(m.activation).toBe("action");
    expect("uses" in withPart(m, "uses", undefined)).toBe(false);
  });

  it("drops a list part that was emptied", () => {
    expect(tidyMechanics({ riders: [], actions: [], choices: [], activation: "action" })).toEqual({ activation: "action" });
  });
});
