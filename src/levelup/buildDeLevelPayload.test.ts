import { describe, expect, it } from "vitest";
import type { CharacterClass } from "@/types/multiclass.types";
import type { LevelChoiceEntry, PartyMember } from "@/types/party.types";
import { buildDeLevelPayload } from "./buildDeLevelPayload";

const member = {
  level: 4, max_hp: 30, current_hp: 30, hit_dice_remaining: 4, str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
  spell_slots: [], class_resources: {}, class_choices: {},
  tool_proficiencies: ["Thieves' Tools", "Lute"], languages: ["Common", "Elvish"],
  skill_proficiencies: { nature: "proficient", stealth: "proficient" }, weapon_masteries: [],
  level_choices: {
    2: { feature_spells: ["old"], record: { choices: {}, abilityIncreases: {}, feats: [], swaps: {} } },
    4: {},
  },
} as unknown as PartyMember;

const classRow = { id: "cc1", class_name: "Rogue", levels: 4, is_primary: true } as unknown as CharacterClass;

function entry(extra: Partial<LevelChoiceEntry>): LevelChoiceEntry {
  return {
    class_name: "Rogue", class_definition_id: "d", is_new_class: false, hp_gained: 6,
    record: { choices: {}, abilityIncreases: {}, feats: [], swaps: {} },
    skills: {}, masteries: { added: [], removed: [] }, ...extra,
  };
}

const run = (e: LevelChoiceEntry) =>
  buildDeLevelPayload({
    member, entry: e, classRow, characterClasses: [classRow], ruleset: "2024", classSlotTable: null, classResources: {},
  });

describe("buildDeLevelPayload feature grants", () => {
  it("removes exactly the tools and languages the level granted, and reverts the granted skill", () => {
    const { memberUpdate } = run(
      entry({ granted_profs: { tools: ["Lute"], languages: ["Elvish"] }, skills: { nature: { from: null, to: "proficient" } } }),
    );
    expect(memberUpdate.tool_proficiencies).toEqual(["Thieves' Tools"]);
    expect(memberUpdate.languages).toEqual(["Common"]);
    expect(memberUpdate.skill_proficiencies).toEqual({ stealth: "proficient" });
  });

  it("leaves tools and languages alone when nothing was granted", () => {
    const { memberUpdate } = run(entry({}));
    expect(memberUpdate).not.toHaveProperty("languages");
    expect(memberUpdate).not.toHaveProperty("tool_proficiencies");
  });

  it("deletes the spells the level's features added, but not ones an earlier level added too", () => {
    expect(run(entry({ feature_spells: ["new", "old"] })).spellIds).toEqual(["new"]);
  });
});
