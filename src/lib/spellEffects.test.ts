import { describe, expect, it } from "vitest";
import { buildStructuredSpellEffects, resolveSpellEffects } from "./spellEffects";

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
});
