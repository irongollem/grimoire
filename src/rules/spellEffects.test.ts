import { describe, expect, it } from "vitest";
import { buildStructuredSpellEffects, effectsForCast, resolveSpellEffects } from "@/rules/spellEffects";

const base = {
  attack_roll: false,
  saving_throw_ability: "dexterity",
  damage_roll: "8d6",
  damage_types: ["Fire"],
  target_type: "creature",
  target_count: 1,
  desc: "A target takes fire damage.",
  casting_options: [],
};

describe("structured spell effect resolver", () => {
  it("gates save damage per target outcome", () => {
    const effects = buildStructuredSpellEffects(base);
    expect(resolveSpellEffects(effects, "impact", { failed: "failed_save", saved: "successful_save" }))
      .toEqual([{ targetId: "failed", effect: effects[0] }]);
  });

  it("resolves half damage only for a successful save when the text says so", () => {
    const effects = buildStructuredSpellEffects({ ...base, desc: "A target takes 8d6 fire damage, or half damage on a successful save." });
    const resolved = resolveSpellEffects(effects, "impact", { saved: "successful_save" });
    expect(resolved).toHaveLength(1);
    expect(resolved[0].effect.multiplier).toBe(0.5);
  });

  it("models attacks, healing, and multi-phase provider options", () => {
    const attack = buildStructuredSpellEffects({ ...base, attack_roll: true, saving_throw_ability: "" });
    expect(attack[0].outcome).toBe("hit");

    const healing = buildStructuredSpellEffects({ ...base, saving_throw_ability: "", desc: "A creature regains Hit Points." });
    expect(healing[0].kind).toBe("healing");

    const phased = buildStructuredSpellEffects({
      ...base,
      casting_options: [{ type: "start_of_turn", damage_roll: "2d6", target_count: 3 }],
    });
    expect(phased[1]).toMatchObject({ phase: "turn_start", dice: "2d6", target: { count: 3 } });
  });

  it("doubles attack damage only for a confirmed critical hit", () => {
    const effects = buildStructuredSpellEffects({ ...base, attack_roll: true, saving_throw_ability: "" });
    expect(resolveSpellEffects(effects, "impact", { target: "critical_hit" })[0].effect.dice).toBe("16d6");
    expect(resolveSpellEffects(effects, "impact", { target: "miss" })).toEqual([]);
  });

  it("selects only the highest eligible cantrip variant", () => {
    const effects = buildStructuredSpellEffects({
      ...base,
      damage_roll: "1d6",
      casting_options: [
        { type: "player_level_5", damage_roll: "2d6" },
        { type: "player_level_11", damage_roll: "3d6" },
      ],
    });
    expect(effectsForCast(effects, 0, 0, 10).map((effect) => effect.dice)).toEqual(["2d6"]);
    expect(effectsForCast(effects, 0, 0, 11).map((effect) => effect.dice)).toEqual(["3d6"]);
  });

  it("applies per-slot scaling to the matching component", () => {
    const effect = { ...buildStructuredSpellEffects(base)[0], scaling: { mode: "slot" as const, dice: "1d6" } };
    expect(effectsForCast([effect], 3, 5, 9)[0].dice).toBe("10d6");
  });

  it("marks explicit spellcasting ability modifiers structurally", () => {
    const effects = buildStructuredSpellEffects({ ...base, saving_throw_ability: "", desc: "The target regains 1d8 plus your spellcasting ability modifier Hit Points." });
    expect(effects[0]).toMatchObject({ kind: "healing", modifier: "spellcasting_ability" });
  });

  it("applies Careful Spell's edition-specific successful-save damage rule", () => {
    const effects = buildStructuredSpellEffects({
      ...base,
      desc: "A target takes 8d6 fire damage, or half damage on a successful save.",
    });
    expect(resolveSpellEffects(effects, "impact", { target: "careful_save" })[0].effect.multiplier).toBe(0.5);
    expect(resolveSpellEffects(
      effects,
      "impact",
      { target: "careful_save" },
      { carefulPreventsDamage: true },
    )).toEqual([]);
  });
});
