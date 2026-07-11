import { describe, it, expect } from "vitest";
import { buildLevelUpPayload, type BuildLevelUpPayloadInput } from "./buildLevelUpPayload";
import type { PartyMember } from "@/types/party.types";

function member(overrides: Partial<PartyMember> = {}): PartyMember {
  return {
    id: "m1",
    max_hp: 20,
    current_hp: 20,
    str: 10, dex: 12, con: 14, int: 8, wis: 13, cha: 11,
    spell_slots: [],
    class_resources: {},
    class_choices: {},
    level_choices: {},
    tool_proficiencies: [],
    ...overrides,
  } as unknown as PartyMember;
}

function baseInput(overrides: Partial<BuildLevelUpPayloadInput> = {}): BuildLevelUpPayloadInput {
  return {
    member: member(),
    nextLevel: 4,
    newProfBonus: 2,
    hpGain: 6,
    newHitDiceCount: 4,
    postLevelupSpellSlots: [],
    grantsAsi: false,
    needsSubclassChoice: false,
    classDefs: [],
    levelInChosenClass: 4,
    classSteps: [],
    isAddingNewClass: false,
    newClassProficiencyGrants: [],
    memberClass: "Ranger",
    chosenExistingEntry: { id: "cc1", levels: 3, subclass_name: "Beast Master", is_primary: true },
    existingClassOptions: [{ id: "cc1", class_name: "Ranger", levels: 3, is_primary: true }],
    asiMode: "plus2",
    asiPrimary: "",
    asiSecondary: "",
    featId: "",
    subclassInput: "",
    stepValues: {},
    stepMultiValues: {},
    selectedSpellIds: new Set(),
    selectedCantripIds: new Set(),
    newClassName: "",
    grantedSpellsForThisLevel: [],
    existingSpellIds: new Set(),
    ...overrides,
  };
}

describe("buildLevelUpPayload", () => {
  it("sets core party_members fields and always records level_choices", () => {
    const { memberUpdate } = buildLevelUpPayload(baseInput());
    expect(memberUpdate.level).toBe(4);
    expect(memberUpdate.proficiency_bonus).toBe(2);
    expect(memberUpdate.max_hp).toBe(26); // 20 + 6
    expect(memberUpdate.current_hp).toBe(26);
    expect(memberUpdate.hit_dice_remaining).toBe(4);
    // level_choices is folded into the single atomic update, keyed by new level.
    expect(memberUpdate.level_choices).toMatchObject({
      4: { class_name: "Ranger", is_new_class: false, hp_gained: 6 },
    });
  });

  it("bumps the existing class entry by one level (classOp update)", () => {
    const { classOp } = buildLevelUpPayload(baseInput());
    expect(classOp).toEqual({ op: "update", id: "cc1", levels: 4 });
  });

  it("adds a new class entry when multiclassing (classOp add)", () => {
    const { classOp } = buildLevelUpPayload(
      baseInput({
        isAddingNewClass: true,
        newClassName: "Wizard",
        chosenExistingEntry: null,
        // one existing class → new entry is non-primary, sort_order after it
        existingClassOptions: [{ id: "cc1", class_name: "Ranger", levels: 3, is_primary: true }],
      }),
    );
    expect(classOp).toEqual({
      op: "add",
      class_name: "Wizard",
      subclass_name: null,
      levels: 1,
      is_primary: false,
      hit_dice_used: 0,
      sort_order: 1,
    });
  });

  it("applies a +2 ASI to the chosen ability", () => {
    const { memberUpdate } = buildLevelUpPayload(
      baseInput({ grantsAsi: true, asiMode: "plus2", asiPrimary: "dex" }),
    );
    expect(memberUpdate.dex).toBe(14); // 12 + 2
    expect((memberUpdate.level_choices as Record<number, unknown>)[4]).toMatchObject({
      asi: { mode: "plus2", primary: "dex" },
    });
  });

  it("retroactively raises max HP when a CON ASI bumps the modifier", () => {
    // con 14 (+2) → 16 (+3): +1 mod × total level 4 = +4 on top of the +6 hpGain
    const { memberUpdate } = buildLevelUpPayload(
      baseInput({ grantsAsi: true, asiMode: "plus2", asiPrimary: "con" }),
    );
    expect(memberUpdate.con).toBe(16);
    expect(memberUpdate.max_hp).toBe(30); // 20 + 6 hpGain + 4 retro
    expect(memberUpdate.current_hp).toBe(30);
  });

  it("adds no retro HP for a non-CON ASI", () => {
    const { memberUpdate } = buildLevelUpPayload(
      baseInput({ grantsAsi: true, asiMode: "plus2", asiPrimary: "dex" }),
    );
    expect(memberUpdate.max_hp).toBe(26); // 20 + 6, no retro
  });

  it("writes the subclass only when the leveled entry is primary", () => {
    const primary = buildLevelUpPayload(
      baseInput({
        needsSubclassChoice: true,
        subclassInput: "Beast Master",
        chosenExistingEntry: { id: "cc1", levels: 2, subclass_name: null, is_primary: true },
      }),
    );
    expect(primary.memberUpdate.subclass).toBe("Beast Master");
    expect(primary.classOp).toMatchObject({ subclass_name: "Beast Master" });

    const secondary = buildLevelUpPayload(
      baseInput({
        needsSubclassChoice: true,
        subclassInput: "Beast Master",
        chosenExistingEntry: { id: "cc2", levels: 2, subclass_name: null, is_primary: false },
      }),
    );
    // A non-primary (multiclass) entry still records subclass on its own class row,
    // but must not overwrite the character's headline `subclass` field.
    expect(secondary.memberUpdate.subclass).toBeUndefined();
  });

  it("emits picked spells, deduped subclass grants, and invocation grant rows", () => {
    const { spellRows } = buildLevelUpPayload(
      baseInput({
        selectedSpellIds: new Set(["srd_hunters_mark"]),
        selectedCantripIds: new Set(["srd_light"]),
        grantedSpellsForThisLevel: ["srd_speak_with_animals", "srd_already_known"],
        existingSpellIds: new Set(["srd_already_known"]),
      }),
    );
    expect(spellRows).toContainEqual({ spell_id: "srd_hunters_mark", is_prepared: false });
    expect(spellRows).toContainEqual({ spell_id: "srd_light", is_prepared: false });
    // granted, not already known → always prepared
    expect(spellRows).toContainEqual({
      spell_id: "srd_speak_with_animals",
      is_prepared: true,
      always_prepared: true,
    });
    // already known granted spell is skipped
    expect(spellRows.some((r) => r.spell_id === "srd_already_known")).toBe(false);
  });

  it("does not touch ability scores or class_choices on a plain level with no picks", () => {
    const { memberUpdate } = buildLevelUpPayload(baseInput());
    expect(memberUpdate.class_choices).toBeUndefined();
    expect(memberUpdate.str).toBeUndefined();
    expect(memberUpdate.subclass).toBeUndefined();
  });
});
