import { describe, expect, it } from "vitest";
import type { ChoicePick } from "@/rules/features/mechanics.types";
import { parseMechanics } from "@/rules/features/mechanics";
import { AMOUNT_KINDS, PICK_KINDS, RIDER_DICE_KINDS, amountOfKind, newChoice, newRider, newSubAction, newToggle, newUses, pickOfKind, riderDiceOfKind, addSpellList, newGrants, setSpellLevel, spellListChoices, toggleSpellList, tidyMechanics, withPart } from "./mechanicsDraft";

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

  it("tidyMechanics drops emptied grant lists and an empty grants part", () => {
    expect(tidyMechanics({ grants: { skills: [], tools: ["Thieves' Tools"] } }).grants).toEqual({ tools: ["Thieves' Tools"] });
    expect("grants" in tidyMechanics({ grants: { skills: [] } })).toBe(false);
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

describe("spell picks", () => {
  const base: Extract<ChoicePick, { kind: "spell" }> = { kind: "spell", lists: ["Wizard"], level: 0, free_cast: false };

  it("the default spell pick parses", () => {
    const { errors } = parseMechanics({ choices: [{ ...newChoice(), key: "k", label: "K", pick: pickOfKind("spell") }] });
    expect(errors).toEqual([]);
  });

  it("toggles a list but never removes the last one", () => {
    const two = toggleSpellList(base, "Cleric", true);
    expect(two.lists).toEqual(["Wizard", "Cleric"]);
    expect(toggleSpellList(two, "Wizard", false).lists).toEqual(["Cleric"]);
    expect(toggleSpellList(base, "Wizard", false)).toBe(base);
  });

  it("adds a homebrew list once, trimmed, ignoring blanks and case duplicates", () => {
    const added = addSpellList(base, "  Witch ");
    expect(added.lists).toEqual(["Wizard", "Witch"]);
    expect(addSpellList(added, "witch")).toBe(added);
    expect(addSpellList(base, "   ")).toBe(base);
  });

  it("offers the standard lists plus any custom name on the pick", () => {
    const choices = spellListChoices(["Wizard", "Witch"]);
    expect(choices).toContain("Bard");
    expect(choices[choices.length - 1]).toBe("Witch");
    expect(choices.filter((c) => c === "Wizard")).toHaveLength(1);
  });

  it("level 0 clears free cast", () => {
    expect(setSpellLevel({ ...base, level: 1, free_cast: true }, 0)).toMatchObject({ level: 0, free_cast: false });
    expect(setSpellLevel({ ...base, level: 1, free_cast: true }, 2)).toMatchObject({ level: 2, free_cast: true });
  });
});

describe("grants", () => {
  it("an untouched grants part is tidied away", () => {
    expect(tidyMechanics({ grants: newGrants() }).grants).toBeUndefined();
  });
});
