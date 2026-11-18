import { describe, it, expect } from "vitest";
import { spellInsertFromAi } from "./spellAiAdapter";
import type { SpellAiGenerated } from "./types";

const DESCRIPTION =
  "Choose a humanoid that you can see within range. The target must succeed on a Wisdom saving throw or be paralyzed for the duration.";
const entry = {
  verdict: "condition", conditions: ["Paralyzed"], stops_casting: null, speed_zero: false, applies: "failed_save", save_ability: "WIS",
  targets: { kind: "one", count: 1, more_per_slot_above: 0 }, only_kinds: ["humanoid"],
  duration: { unit: "minute", amount: 1, concentration: true }, repeat_save: null,
};

function generated(over: Partial<SpellAiGenerated> = {}): SpellAiGenerated {
  return {
    name: "Still Hand", level: 2, school: "enchantment", casting_time: "1 action", casting_time_custom: null, range: "60 feet",
    range_custom: null, components: ["V", "S"], material: null, duration: "Concentration, up to 1 minute", duration_custom: null,
    concentration: true, ritual: false, attack_type: "save", save_attribute: "WIS", save_effect: "negates", damage_rolls: null,
    healing_dice: null, target_description: null, aoe_shape: null, aoe_size: null, description: DESCRIPTION, higher_levels: null,
    classes: [], tags: [], image_prompt: "", image_url: null, condition_effect: entry, ...over,
  };
}

describe("spellInsertFromAi condition_effect", () => {
  // Bug caught: a good entry thrown away, so every generated Hold Person still imposes nothing in a fight.
  it("keeps a valid entry the description supports", () => {
    expect(spellInsertFromAi(generated()).condition_effect).toEqual(entry);
  });

  // Bug caught: a condition the description never names (Stunned for a spell that paralyses) reaching a fight.
  it("lands as null when the entry names a condition the description never says", () => {
    expect(spellInsertFromAi(generated({ condition_effect: { ...entry, conditions: ["Stunned"] } })).condition_effect).toBeNull();
  });

  // Bug caught: a malformed answer stored, or the adapter throwing on it.
  it("lands as null when the answer is malformed or absent", () => {
    expect(spellInsertFromAi(generated({ condition_effect: { verdict: "maybe" } })).condition_effect).toBeNull();
    expect(spellInsertFromAi(generated({ condition_effect: "paralyzed" })).condition_effect).toBeNull();
    expect(spellInsertFromAi(generated({ condition_effect: undefined })).condition_effect).toBeNull();
  });

  // Bug caught: concentration in the entry disagreeing with the spell it is stored on.
  it("lands as null when the entry's concentration disagrees with the spell's", () => {
    expect(spellInsertFromAi(generated({ concentration: false })).condition_effect).toBeNull();
  });

  // Bug caught: the generator still filling the retired free-text condition.
  it("does not fill the retired free-text condition", () => {
    expect("condition_inflicted" in spellInsertFromAi(generated())).toBe(false);
  });
});
