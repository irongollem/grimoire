import { describe, it, expect } from "vitest";
import { isInternalChoiceKey } from "@/lib/classChoices";

describe("isInternalChoiceKey", () => {
  it("hides turn-scoped combat bookkeeping keys (value is an encounter turn key, not a choice)", () => {
    // These are written into class_choices by the spellcasting engine; their
    // value looks like `encounterId:round:combatantIndex` and must never render.
    expect(isInternalChoiceKey("noncantrip_spell_turn")).toBe(true);
    expect(isInternalChoiceKey("bonus_action_spell_turn")).toBe(true);
    expect(isInternalChoiceKey("spell_slot_cast_turn")).toBe(true);
    expect(isInternalChoiceKey("arcane_apotheosis_turn")).toBe(true);
    // A future `*_turn` key is covered by the convention without a code change.
    expect(isInternalChoiceKey("some_new_spell_turn")).toBe(true);
  });

  it("hides keys owned by a dedicated card or applied elsewhere", () => {
    for (const key of [
      "metamagic_options",
      "infusions_known",
      "eldritch_invocations",
      "battle_master_maneuvers",
      "background_feat",
      "background_asi",
    ]) {
      expect(isInternalChoiceKey(key)).toBe(true);
    }
  });

  it("shows genuine build choices", () => {
    expect(isInternalChoiceKey("subclass")).toBe(false);
    expect(isInternalChoiceKey("fighting_style")).toBe(false);
    expect(isInternalChoiceKey("feats")).toBe(false);
    expect(isInternalChoiceKey("divine_domain")).toBe(false);
  });

  it("does not over-match keys that merely contain 'turn'", () => {
    expect(isInternalChoiceKey("turning_style")).toBe(false);
    expect(isInternalChoiceKey("nocturnal_gift")).toBe(false);
  });
});
