import { describe, expect, it } from "vitest";
import { computeSpellcastingPerClass, pickSpellcastingStats, type CharacterClass } from "./multiclass.types";

const classRow = (id: string, class_name: string, levels: number): CharacterClass => ({
  id, class_name, levels, party_member_id: "member", subclass_name: null,
  is_primary: id === "paladin", hit_dice_used: 0, sort_order: 0, created_at: "", updated_at: "",
});

describe("multiclass spell source abilities", () => {
  it("uses the source class rather than total or primary class", () => {
    const stats = computeSpellcastingPerClass(
      { str: 10, dex: 10, con: 10, int: 18, wis: 14, cha: 12, proficiency_bonus: 3 },
      [classRow("paladin", "Paladin", 3), classRow("wizard", "Wizard", 5)],
    );
    expect(pickSpellcastingStats(stats, "paladin")).toMatchObject({ castingAbility: "cha", attack: 4, dc: 12 });
    expect(pickSpellcastingStats(stats, "wizard")).toMatchObject({ castingAbility: "int", attack: 7, dc: 15 });
  });

  it("keeps a legacy fallback without overriding a valid source match", () => {
    const stats = computeSpellcastingPerClass(
      { str: 10, dex: 10, con: 10, int: 16, wis: 16, cha: 10, proficiency_bonus: 2 },
      [classRow("cleric", "Cleric", 2), classRow("wizard", "Wizard", 2)],
    );
    expect(pickSpellcastingStats(stats, null)?.classId).toBe("cleric");
    expect(pickSpellcastingStats(stats, "wizard")?.classId).toBe("wizard");
  });
});
