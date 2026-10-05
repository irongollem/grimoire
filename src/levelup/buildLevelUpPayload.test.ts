import { describe, it, expect } from "vitest";
import { buildLevelUpPayload, type BuildLevelUpPayloadInput } from "./buildLevelUpPayload";
import type { PartyMember } from "@/types/party.types";
import type { ResolvedPicks } from "./levelPicks";

const noPicks: ResolvedPicks = {
  record: { choices: {}, abilityIncreases: {}, feats: [], swaps: {} },
  skills: {},
  masteries: { added: [], removed: [] },
};

/** A level whose only choice was an ability increase, already capped by the resolver. */
const increase = (abilityIncreases: ResolvedPicks["record"]["abilityIncreases"]): ResolvedPicks => ({
  ...noPicks,
  record: { ...noPicks.record, abilityIncreases },
});

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
    skill_proficiencies: {},
    weapon_masteries: [],
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
    needsSubclassChoice: false,
    picks: noPicks,
    classResources: {},
    isAddingNewClass: false,
    newClassProficiencyGrants: [],
    memberClass: "Ranger",
    chosenExistingEntry: { id: "cc1", levels: 3, class_definition_id: "def-existing", subclass_name: "Beast Master", is_primary: true },
    existingClassOptions: [{ id: "cc1", class_name: "Ranger", levels: 3, is_primary: true }],
    subclassInput: "",
    selectedSpellIds: new Set(),
    selectedCantripIds: new Set(),
    newClassName: "",
    newClassDefinitionId: null,
    newClassDefinitionKind: null,
    subclassDefinitionId: null,
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
        newClassDefinitionId: "wiz-def",
        newClassDefinitionKind: "system",
        chosenExistingEntry: null,
        // one existing class → new entry is non-primary, sort_order after it
        existingClassOptions: [{ id: "cc1", class_name: "Ranger", levels: 3, is_primary: true }],
      }),
    );
    expect(classOp).toEqual({
      op: "add",
      class_name: "Wizard",
      class_definition_id: "wiz-def",
      class_definition_kind: "system",
      subclass_definition_id: null,
      subclass_name: null,
      levels: 1,
      is_primary: false,
      hit_dice_used: 0,
      sort_order: 1,
    });
  });

  it("keeps the subclass taken together with a new class, name and id both", () => {
    const { classOp } = buildLevelUpPayload(
      baseInput({
        isAddingNewClass: true,
        needsSubclassChoice: true,
        subclassInput: "Life Domain",
        subclassDefinitionId: "life-def",
        newClassName: "Cleric",
        newClassDefinitionId: "cleric-def",
        newClassDefinitionKind: "system",
        chosenExistingEntry: null,
        existingClassOptions: [],
      }),
    );
    expect(classOp).toMatchObject({
      op: "add",
      subclass_name: "Life Domain",
      subclass_definition_id: "life-def",
    });
  });

  it("sends no subclass on a new class when none is due", () => {
    const { classOp } = buildLevelUpPayload(
      baseInput({
        isAddingNewClass: true,
        subclassInput: "Life Domain",
        subclassDefinitionId: "life-def",
        newClassName: "Cleric",
        newClassDefinitionId: "cleric-def",
        newClassDefinitionKind: "system",
        chosenExistingEntry: null,
        existingClassOptions: [],
      }),
    );
    expect(classOp).toMatchObject({ subclass_name: null, subclass_definition_id: null });
  });

  it("applies the capped ability increases and keeps them in the level's record", () => {
    const { memberUpdate } = buildLevelUpPayload(baseInput({ picks: increase({ dex: 2 }) }));
    expect(memberUpdate.dex).toBe(14); // 12 + 2
    expect((memberUpdate.level_choices as Record<number, unknown>)[4]).toMatchObject({
      record: { abilityIncreases: { dex: 2 } },
    });
  });

  it("retroactively raises max HP when a CON ASI bumps the modifier", () => {
    // con 14 (+2) → 16 (+3): +1 mod × total level 4 = +4 on top of the +6 hpGain
    const { memberUpdate } = buildLevelUpPayload(
      baseInput({ picks: increase({ con: 2 }) }),
    );
    expect(memberUpdate.con).toBe(16);
    expect(memberUpdate.max_hp).toBe(30); // 20 + 6 hpGain + 4 retro
    expect(memberUpdate.current_hp).toBe(30);
  });

  it("adds no retro HP for a non-CON ASI", () => {
    const { memberUpdate } = buildLevelUpPayload(
      baseInput({ picks: increase({ dex: 2 }) }),
    );
    expect(memberUpdate.max_hp).toBe(26); // 20 + 6, no retro
  });

  it("writes a subclass on the class row as a name and definition pair, never on the member", () => {
    const { classOp, memberUpdate } = buildLevelUpPayload(
      baseInput({
        needsSubclassChoice: true,
        subclassInput: "Beast Master",
        subclassDefinitionId: "bm-def",
        chosenExistingEntry: { id: "cc1", levels: 2, class_definition_id: "def-existing", subclass_name: null, is_primary: true },
      }),
    );
    expect(classOp).toMatchObject({ subclass_name: "Beast Master", subclass_definition_id: "bm-def" });
    // `party_members.subclass` is the database's mirror; the client never writes it.
    expect(memberUpdate.subclass).toBeUndefined();
  });

  it("does not send a subclass name without its definition", () => {
    const { classOp, memberUpdate } = buildLevelUpPayload(
      baseInput({
        needsSubclassChoice: true,
        subclassInput: "Beast Master",
        chosenExistingEntry: { id: "cc1", levels: 2, class_definition_id: "def-existing", subclass_name: null, is_primary: true },
      }),
    );
    expect(classOp).toEqual({ op: "update", id: "cc1", levels: 3 });
    // Nor does the name leak into the choice records, where it would outlive no definition.
    const classChoices = memberUpdate.class_choices as { subclass?: string } | undefined;
    const levelChoices = memberUpdate.level_choices as Record<number, { subclass?: string }>;
    expect(classChoices?.subclass).toBeUndefined();
    expect(levelChoices[4].subclass).toBeUndefined();
  });

  it("adds a classless character's first class at its new total level", () => {
    const { classOp, memberUpdate } = buildLevelUpPayload(
      baseInput({
        nextLevel: 4,
        isAddingNewClass: true,
        newClassName: "Fighter",
        newClassDefinitionId: "fighter-def",
        newClassDefinitionKind: "system",
        memberClass: "Fighter",
        chosenExistingEntry: null,
        existingClassOptions: [],
      }),
    );
    expect(classOp).toEqual({
      op: "add",
      class_name: "Fighter",
      class_definition_id: "fighter-def",
      class_definition_kind: "system",
      subclass_name: null,
      subclass_definition_id: null,
      levels: 4,
      is_primary: true,
      hit_dice_used: 0,
      sort_order: 0,
    });
    expect(memberUpdate.level).toBe(4);
  });

  it("refuses to add a class that resolved to no definition", () => {
    expect(() =>
      buildLevelUpPayload(
        baseInput({
          isAddingNewClass: true,
          newClassName: "Fighter",
          chosenExistingEntry: null,
          existingClassOptions: [],
        }),
      ),
    ).toThrow("Pick the class");
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

  it("never writes the subclass into class_choices; the class row is its home", () => {
    const { memberUpdate } = buildLevelUpPayload(
      baseInput({
        needsSubclassChoice: true,
        subclassInput: "Beast Master",
        subclassDefinitionId: "bm-def",
        chosenExistingEntry: { id: "cc1", levels: 2, class_definition_id: "def-existing", subclass_name: null, is_primary: true },
      }),
    );
    expect(memberUpdate.class_choices).toBeUndefined();
  });

  it("does not touch ability scores or class_choices on a plain level with no picks", () => {
    const { memberUpdate } = buildLevelUpPayload(baseInput());
    expect(memberUpdate.class_choices).toBeUndefined();
    expect(memberUpdate.str).toBeUndefined();
    expect(memberUpdate.subclass).toBeUndefined();
  });
});
