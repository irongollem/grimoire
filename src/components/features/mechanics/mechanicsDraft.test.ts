import { describe, expect, it } from "vitest";
import type { ChoicePick, FeatureEffect } from "@/rules/features/mechanics.types";
import { parseMechanics } from "@/rules/features/mechanics";
import { AMOUNT_KINDS, EFFECT_KIND_OPTIONS, PICK_KINDS, RIDER_DICE_KINDS, amountOfKind, newChoice, newRider, newSubAction, newToggle, newUses, pickOfKind, riderDiceOfKind, addSpellList, effectOfKind, hasAdd, newEffect, toggleAdd, withDamage, withForcedSave, newGrants, setSpellLevel, spellListChoices, toggleSpellList, tidyMechanics, withPart, withMin, withDice, rollsDice, toggleFlatAdd, withFlatMin } from "./mechanicsDraft";

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

describe("rolls", () => {
  it("every effect kind starts as something the parser accepts once its dice are typed", () => {
    for (const { value } of EFFECT_KIND_OPTIONS) {
      const base = effectOfKind(value);
      const typed = base.dice ? { ...base, dice: { "1": "1d6" } } : base;
      expect(parseMechanics({ effect: typed }).errors, value).toEqual([]);
    }
  });

  it("changing the kind keeps dice, adds and area and brings the block the new kind needs", () => {
    const save = { ...effectOfKind("save"), dice: { "3": "2d8" }, damage_type: "fire", area: "15-ft cone", add: [{ kind: "proficiency" as const }] };
    const attack = effectOfKind("attack", save);
    expect(attack).toMatchObject({ kind: "attack", dice: { "3": "2d8" }, damage_type: "fire", area: "15-ft cone", attack: { delivery: "melee" } });
    expect(attack.save).toBeUndefined();
    const heal = effectOfKind("heal", save);
    expect(heal.damage_type).toBeUndefined();
    expect(heal.save).toBeUndefined();
    expect(heal.attack).toBeUndefined();
  });

  it("an attack keeps its forced save when edited", () => {
    const forced = withForcedSave(effectOfKind("attack"), true);
    expect(forced.save).toBeDefined();
    expect(effectOfKind("attack", forced).save).toEqual(forced.save);
    expect(withForcedSave(forced, false).save).toBeUndefined();
  });

  it("damage on an attack or save switches on with blank dice and off with everything about them", () => {
    const on = withDamage({ ...effectOfKind("save"), damage_type: "fire", add: [{ kind: "class_level" }] }, true);
    expect(on.dice).toEqual({ "1": "" });
    expect(on.damage_type).toBeUndefined();
    const off = withDamage({ ...on, damage_type: "fire" }, false);
    expect(off.dice).toBeUndefined();
    expect(off.damage_type).toBeUndefined();
  });

  it("ticks and unticks addends, each ability on its own, and drops an emptied list", () => {
    let e = effectOfKind("damage");
    e = toggleAdd(e, { kind: "ability", ability: "cha" }, true);
    e = toggleAdd(e, { kind: "ability", ability: "int" }, true);
    e = toggleAdd(e, { kind: "proficiency" }, true);
    expect(hasAdd(e, { kind: "ability", ability: "cha" })).toBe(true);
    expect(hasAdd(e, { kind: "ability", ability: "wis" })).toBe(false);
    e = toggleAdd(e, { kind: "ability", ability: "cha" }, false);
    expect(e.add).toEqual([{ kind: "ability", ability: "int" }, { kind: "proficiency" }]);
    e = toggleAdd(toggleAdd(e, { kind: "ability", ability: "int" }, false), { kind: "proficiency" }, false);
    expect(e.add).toBeUndefined();
  });

  it("a new roll sits on a sub-action and survives the round trip", () => {
    const action = { ...newSubAction(), name: "Flamethrower", effect: { ...newEffect(), dice: { "3": "2d8" } } };
    expect(parseMechanics({ actions: [action] })).toEqual({ mechanics: { actions: [action] }, errors: [] });
  });
});

describe("temp_hp, floors and flat riders in the editor", () => {
  it("offers temporary hit points and gives it dice like healing, without a damage type", () => {
    expect(EFFECT_KIND_OPTIONS.map((o) => o.value)).toContain("temp_hp");
    const e = effectOfKind("temp_hp", { kind: "damage", dice: { "1": "1d6" }, damage_type: "fire", min: 2 });
    expect(e).toEqual({ kind: "temp_hp", dice: { "1": "1d6" }, min: 2 });
    expect(effectOfKind("temp_hp").dice).toEqual({ "1": "" });
  });

  it("sets and clears a floor, and drops it with the damage", () => {
    const base: FeatureEffect = { kind: "heal", dice: { "1": "1d4" } };
    expect(withMin(base, "3")).toEqual({ ...base, min: 3 });
    expect(withMin({ ...base, min: 3 }, "")).toEqual(base);
    expect(withMin(base, "-1")).toEqual(base);
    expect(withDamage({ kind: "save", save: { ability: "dex", dc_ability: "cha", success: "half" }, dice: { "1": "1d4" }, min: 2 }, false).min).toBeUndefined();
  });

  it("starts a flat rider on Charisma with a minimum of 1 and edits its addends", () => {
    const flat = riderDiceOfKind("flat");
    if (flat.kind !== "flat") throw new Error("expected flat");
    expect(flat).toEqual({ kind: "flat", add: [{ kind: "ability", ability: "cha" }], min: 1 });
    expect(toggleFlatAdd(flat, { kind: "proficiency" }, true).add).toHaveLength(2);
    // the last addend cannot be unticked: an empty flat rider adds nothing
    expect(toggleFlatAdd(flat, { kind: "ability", ability: "cha" }, false)).toEqual(flat);
    expect(withFlatMin(flat, "")).toEqual({ kind: "flat", add: flat.add });
    expect(withFlatMin(flat, "2").min).toBe(2);
  });
});

describe("a fixed amount with no dice", () => {
  it("drops the dice, keeps the addends and stays something the parser accepts", () => {
    const rolled: FeatureEffect = { kind: "temp_hp", dice: { "1": "1d8" }, add: [{ kind: "ability", ability: "int" }], min: 1 };
    const fixed = withDice(rolled, false);
    expect(rollsDice(fixed)).toBe(false);
    expect(fixed).toEqual({ kind: "temp_hp", add: [{ kind: "ability", ability: "int" }], min: 1 });
    expect(parseMechanics({ effect: fixed }).errors).toEqual([]);
  });

  it("falls back to the proficiency bonus when nothing was ticked, and never ends up empty", () => {
    const fixed = withDice({ kind: "heal", dice: { "1": "1d4" } }, false);
    expect(fixed.add).toEqual([{ kind: "proficiency" }]);
    expect(parseMechanics({ effect: fixed }).errors).toEqual([]);
    expect(toggleAdd(fixed, { kind: "proficiency" }, false)).toEqual(fixed);
  });

  it("brings blank dice back when turned on again", () => {
    expect(withDice({ kind: "damage", add: [{ kind: "proficiency" }] }, true).dice).toEqual({ "1": "" });
  });
});
