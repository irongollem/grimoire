import { describe, expect, it } from "vitest";
import { buildStructuredSpellEffects, effectsForCast, resolveSpellEffects } from "@/lib/spellEffects";

const fixtures = {
  "2014": {
    attack: { name: "Fire Bolt", dice: "1d10" },
    save: { name: "Fireball", dice: "8d6" },
    healing: { name: "Cure Wounds", dice: "1d8" },
  },
  "2024": {
    attack: { name: "Fire Bolt", dice: "1d10" },
    save: { name: "Fireball", dice: "8d6" },
    healing: { name: "Cure Wounds", dice: "2d8" },
  },
} as const;

const source = (overrides: Record<string, unknown>) => ({
  attack_roll: false,
  saving_throw_ability: "",
  damage_roll: "",
  damage_types: [] as string[],
  target_type: "creature",
  target_count: 1,
  desc: "",
  casting_options: [] as Array<Record<string, unknown>>,
  ...overrides,
});

describe.each(Object.entries(fixtures))("%s SRD golden effects", (_ruleset, edition) => {
  it(`${edition.attack.name}: attack damage waits for hit and doubles on a critical`, () => {
    const effects = buildStructuredSpellEffects(source({
      attack_roll: true, damage_roll: edition.attack.dice, damage_types: ["fire"],
    }));
    expect(resolveSpellEffects(effects, "impact", { miss: "miss" })).toEqual([]);
    expect(resolveSpellEffects(effects, "impact", { hit: "hit" })[0].effect.dice).toBe(edition.attack.dice);
    expect(resolveSpellEffects(effects, "impact", { critical: "critical_hit" })[0].effect.dice).toBe("2d10");
  });

  it(`${edition.save.name}: area targets resolve failed and successful saves independently`, () => {
    const effects = buildStructuredSpellEffects(source({
      saving_throw_ability: "dexterity", damage_roll: edition.save.dice, damage_types: ["fire"],
      target_type: "sphere", target_count: 4, desc: "A target takes damage, or half damage on a successful save.",
    }));
    const resolved = resolveSpellEffects(effects, "impact", { failed: "failed_save", saved: "successful_save" });
    expect(resolved.map(row => [row.targetId, row.effect.multiplier])).toEqual([["failed", 1], ["saved", 0.5]]);
    expect(effects[0].target).toEqual({ type: "sphere", count: 4 });
  });

  it(`${edition.healing.name}: healing keeps its edition dice and explicit ability modifier`, () => {
    const effects = buildStructuredSpellEffects(source({
      damage_roll: edition.healing.dice,
      desc: `A creature regains ${edition.healing.dice} plus your spellcasting ability modifier Hit Points.`,
    }));
    expect(effects[0]).toMatchObject({
      kind: "healing", dice: edition.healing.dice, modifier: "spellcasting_ability",
    });
  });

  it("Moonbeam: persistent phases remain separate from impact", () => {
    const effects = buildStructuredSpellEffects(source({
      saving_throw_ability: "constitution", damage_roll: "2d10", damage_types: ["radiant"],
      casting_options: [{ type: "start_of_turn", damage_roll: "2d10", desc: "Repeat the save." }],
    }));
    expect(effects.map(effect => effect.phase)).toEqual(["impact", "turn_start"]);
    expect(resolveSpellEffects(effects, "turn_start", { target: "failed_save" })).toHaveLength(1);
  });

  it("utility spells remain manual when no structured outcome exists", () => {
    const effects = buildStructuredSpellEffects(source({ desc: "Choose a lock, door, or container. It opens." }));
    expect(effectsForCast(effects, 2, 2, 5)).toEqual([]);
  });
});
