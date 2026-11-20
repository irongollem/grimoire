/** The damage a condition deals at a turn edge. */
import { describe, expect, it } from "vitest";
import type { RunCombatant } from "@/types/encounter.types";
import { emptyDefenses } from "@/types/statBlock.types";
import { combatant } from "../fightTestKit";
import { resolveOngoingDamageOn } from "./ongoingDamage";
import { scripted, table } from "./resolutionTestKit";

describe("ongoing damage", () => {
  // Ongoing damage goes through the bearer's defenses: 1d4 fire with a 3 is 3; a fire-resistant bearer takes floor(3/2) = 1.
  it("ongoing damage is rolled, run through defenses, taken off, and the debt cleared", async () => {
    const burning = (): RunCombatant =>
      combatant("g", { hp: 10, max_hp: 10, conditions: [{ name: "Burning", ongoing: { dice: "1d4", type: "fire", at: "start" }, due: { damage: true } }] });
    const plain = table([burning()], { dice: scripted([[3]]).dice });
    const out = await resolveOngoingDamageOn(plain.ctx, { target: plain.get("g"), condition: plain.get("g").conditions[0] });
    expect(out.summary.damageTotal).toBe(3);
    expect(plain.hp("g")).toBe(7);
    expect(plain.get("g").conditions[0].due?.damage).toBeFalsy();

    const resistant = table([burning()], {
      dice: scripted([[3]]).dice,
      defenses: { g: { ...emptyDefenses(), resistances: [{ types: ["fire"] }] } },
    });
    await resolveOngoingDamageOn(resistant.ctx, { target: resistant.get("g"), condition: resistant.get("g").conditions[0] });
    expect(resistant.hp("g")).toBe(9);
  });
});
