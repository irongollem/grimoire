import { describe, expect, it } from "vitest";
import type { CuratedSpellMechanics } from "@/lib/library/curatedSpellMechanics";
import { planCuratedWrites } from "./apply-curated-spell-mechanics.ts";

const entry: CuratedSpellMechanics = {
  verdict: "roll", category: null, evidence: "x",
  roll: {
    kind: "damage", resolution: "automatic", save_ability: null, save_half: null, parts: [{ dice: "2d8", type: "necrotic" }],
    type_choices: null, adds_spellcasting_modifier: false, instances: null, upcast: null, cantrip_scaling: false,
  },
};
const row = (id: string, over: Partial<{ mechanics_reviewed: boolean; provenance: Record<string, unknown> | null }> = {}) => ({
  id, level: 1, description: "d", mechanics_reviewed: false, provenance: null, ...over,
});
const AT = "2026-11-01T00:00:00.000Z";

describe("planCuratedWrites", () => {
  it("never overwrites a row a reviewer already approved (it could be hand-corrected)", () => {
    const plan = planCuratedWrites([row("a", { mechanics_reviewed: true })], { a: entry }, AT);
    expect(plan.writes).toEqual([]);
    expect(plan.alreadyReviewed).toEqual(["a"]);
  });

  it("writes only the eight mechanics columns and provenance, merging existing provenance", () => {
    const plan = planCuratedWrites([row("a", { provenance: { open5e: "x" } })], { a: entry }, AT);
    expect(Object.keys(plan.writes[0].patch).sort()).toEqual([
      "attack_type", "damage_rolls", "effects", "healing_dice", "higher_level_damage", "higher_level_healing", "provenance", "save_attribute", "save_effect",
    ]);
    expect(plan.writes[0].patch.provenance).toEqual({ open5e: "x", mechanics_curated: { by: "agent-extraction", agreed: 2, at: AT } });
  });

  it("a not_one_roll entry writes nothing, and an unknown id is reported rather than invented", () => {
    const plan = planCuratedWrites([row("a")], { a: { verdict: "not_one_roll", category: "summon", roll: null, evidence: "x" }, ghost: entry }, AT);
    expect(plan.writes).toEqual([]);
    expect(plan.notOneRoll).toBe(1);
    expect(plan.missing).toEqual(["ghost"]);
  });

  it("an entry the converter refuses is reported and does not stop the others", () => {
    const bad: CuratedSpellMechanics = { ...entry, roll: { ...(entry.roll as NonNullable<typeof entry.roll>), cantrip_scaling: true } };
    const plan = planCuratedWrites([row("a"), row("b")], { a: bad, b: entry }, AT);
    expect(plan.unconvertible.map((u) => u.id)).toEqual(["a"]);
    expect(plan.writes.map((w) => w.id)).toEqual(["b"]);
  });
});
