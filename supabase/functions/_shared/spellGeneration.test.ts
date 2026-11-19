import { describe, expect, it } from "vitest";
import { vetGeneratedSpell } from "./spellGeneration";

const DESCRIPTION =
  "Choose a humanoid that you can see within range. The target must succeed on a Wisdom saving throw or be paralyzed for the duration.";
const entry = {
  verdict: "condition", conditions: ["Paralyzed"], stops_casting: null, speed_zero: false, applies: "failed_save", save_ability: "WIS",
  targets: { kind: "one", count: 1, more_per_slot_above: 0 }, only_kinds: ["humanoid"],
  duration: { unit: "minute", amount: 1, concentration: true }, repeat_save: null,
};
const answer = (over: Record<string, unknown> = {}) => ({ name: "Still Hand", description: DESCRIPTION, concentration: true, condition_effect: entry, ...over });

describe("vetGeneratedSpell", () => {
  // Bug caught: the server dropping a good entry, or rewriting the rest of the answer.
  it("keeps a valid, text-supported entry and the rest of the answer", () => {
    expect(vetGeneratedSpell(answer())).toEqual(answer());
  });

  // Bug caught: an invented condition leaving the server, to be trusted by every client.
  it("answers null for an entry whose condition the description never says", () => {
    expect(vetGeneratedSpell(answer({ condition_effect: { ...entry, conditions: ["Stunned"] } })).condition_effect).toBeNull();
  });

  // Bug caught: a malformed entry, or none at all, passed through or thrown on.
  it("answers null for a malformed or missing entry", () => {
    expect(vetGeneratedSpell(answer({ condition_effect: { verdict: "maybe" } })).condition_effect).toBeNull();
    expect(vetGeneratedSpell({ name: "x", description: DESCRIPTION }).condition_effect).toBeNull();
    expect(vetGeneratedSpell(answer({ description: 4 })).condition_effect).toBeNull();
  });

  // Bug caught: the retired free-text condition still travelling back to the client.
  it("drops the retired condition_inflicted", () => {
    expect("condition_inflicted" in vetGeneratedSpell(answer({ condition_inflicted: "blinded" }))).toBe(false);
  });
});
