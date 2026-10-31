import { describe, expect, it } from "vitest";
import { buildStructuredSpellEffects, describesHealing, effectsForCast, resolveSpellEffects } from "@/rules/spellEffects";

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

  // PHB 2014 "Saving Throws": half damage on a successful save only when the spell says so.
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

  // PHB 2014 "Attack Rolls" (critical hits): double the damage dice on a crit.
  it("doubles attack damage only for a confirmed critical hit", () => {
    const effects = buildStructuredSpellEffects({ ...base, attack_roll: true, saving_throw_ability: "" });
    expect(resolveSpellEffects(effects, "impact", { target: "critical_hit" })[0].effect.dice).toBe("16d6");
    expect(resolveSpellEffects(effects, "impact", { target: "miss" })).toEqual([]);
  });

  // PHB 2014 "Cantrips": damage steps up at character levels 5, 11 and 17.
  // PHB 2014 "Making an Attack": a critical hit doubles damage dice, not healing.
  it("does not double healing dice on a critical hit", () => {
    const effects = buildStructuredSpellEffects({ ...base, attack_roll: true, saving_throw_ability: "", desc: "A creature regains Hit Points." });
    expect(resolveSpellEffects(effects, "impact", { target: "critical_hit" })[0].effect.dice).toBe("8d6");
  });

  it("only a Careful Spell target is spared: a failed save still takes damage when careful prevents damage", () => {
    const effects = buildStructuredSpellEffects(base);
    const resolved = resolveSpellEffects(effects, "impact", { careful: "careful_save", failed: "failed_save" }, { carefulPreventsDamage: true });
    expect(resolved.map((row) => row.targetId)).toEqual(["failed"]);
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
  // Production Fireball (2014): Open5e's per-level table became summed effects, so a
  // 3rd-level cast rolled 8d6+9d6+...+14d6.
  describe("slot-level casting options", () => {
    const fireball = {
      ...base,
      desc: "Each creature takes 8d6 fire damage on a failed save, or half as much damage on a successful one.",
      casting_options: [
        { type: "default", damage_roll: "8d6" },
        { type: "slot_level_4", damage_roll: "9d6" },
        { type: "slot_level_5", damage_roll: "10d6" },
        { type: "ritual", damage_roll: null },
      ],
    };

    it("does not turn the per-level table into effects", () => {
      expect(buildStructuredSpellEffects(fireball).map((effect) => effect.id)).toEqual(["base", "base-save-half"]);
    });

    it("casts at a higher slot as base dice plus slot scaling, not a sum of table rows", () => {
      const effects = buildStructuredSpellEffects(fireball).map((effect) => ({
        ...effect,
        scaling: { mode: "slot" as const, dice: "1d6" },
      }));
      expect(effectsForCast(effects, 3, 5, 9).map((effect) => effect.dice)).toEqual(["10d6", "10d6"]);
    });
  });

  // Chill Touch: "it can't regain hit points until the start of your next turn".
  it.each([
    ["The target can't regain hit points until the start of your next turn.", false],
    ["The creature cannot regain Hit Points until then.", false],
    ["The target regains hit points equal to 1d4.", true],
  ])("healing predicate: %s", (desc, expected) => {
    expect(describesHealing(desc)).toBe(expected);
    expect(buildStructuredSpellEffects({ ...base, saving_throw_ability: "", desc })[0].kind)
      .toBe(expected ? "healing" : "damage");
  });
});

describe("effectsForCast: rays, darts and beams", () => {
  const stored = (instances: NonNullable<Parameters<typeof effectsForCast>[0][number]["instances"]>) =>
    buildStructuredSpellEffects({ ...base, attack_roll: true, saving_throw_ability: "", damage_roll: "2d6" }).map((effect) => ({ ...effect, instances }));

  // SRD 5.2 Scorching Ray: three rays, one more per slot level above 2nd.
  it.each([
    [2, 3],
    [3, 4],
    [5, 6],
  ])("makes the rays of a level %i slot: %i", (cast, count) => {
    const [effect] = effectsForCast(stored({ noun: "ray", count: 3, perSlotAbove: 1 }), 2, cast, 5);
    expect(effect.instances).toEqual({ noun: "ray", count });
  });

  // Bug: a slot below the spell's level (a ritual or a custom cast) took away rays.
  it("never makes fewer rays than the base count", () => {
    expect(effectsForCast(stored({ noun: "ray", count: 3, perSlotAbove: 1 }), 2, 1, 5)[0].instances).toEqual({ noun: "ray", count: 3 });
  });

  // SRD 5.2 Eldritch Blast: 5, 11 and 17 add a beam each; PHB 2014 "Cantrips" use the character level.
  it.each([
    [1, 1], [4, 1], [5, 2], [10, 2], [11, 3], [16, 3], [17, 4], [20, 4],
  ])("makes the beams at character level %i: %i", (level, count) => {
    const effects = effectsForCast(stored({ noun: "beam", count: 1, byCharacterLevel: [{ level: 5, count: 2 }, { level: 11, count: 3 }, { level: 17, count: 4 }] }), 0, 0, level);
    expect(effects[0].instances).toEqual({ noun: "beam", count });
  });

  // Bug: the stored scaling leaked into the cast, so the resolver would count twice.
  it("drops the scaling it resolved", () => {
    const [effect] = effectsForCast(stored({ noun: "dart", count: 3, perSlotAbove: 1, byCharacterLevel: [{ level: 5, count: 4 }] }), 1, 2, 1);
    expect(Object.keys(effect.instances ?? {}).sort()).toEqual(["count", "noun"]);
  });

  it("leaves an effect without instances alone", () => {
    expect(effectsForCast(buildStructuredSpellEffects(base), 3, 5, 9)[0].instances).toBeUndefined();
  });
});
