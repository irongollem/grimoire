/**
 * Taking damage off a creature: the conditions that end when it is harmed. Every expected number is worked out in the
 * comment above it from the rule it comes from, never read off a run.
 */
import { describe, expect, it } from "vitest";
import type { RunCombatant } from "@/types/encounter.types";
import { emptyDefenses } from "@/types/statBlock.types";
import { combatant } from "../fightTestKit";
import { applyDamage } from "./damage";
import { scripted, table } from "./resolutionTestKit";

// SRD 5.2.1 "Charm Monster": "On a failed save, the target has the Charmed condition until the spell ends or until you or
// your allies damage it." 2014 "Charm Person": "ends if you or your companions do anything harmful to it".
describe("a condition that ends when it is harmed", () => {
  const charmed = (harmed: "source_side" | "anyone" = "source_side"): RunCombatant =>
    combatant("victim", {
      hp: 40, max_hp: 40, faction_id: "foes",
      conditions: [
        { name: "Charmed", source: { id: "mage", spell: "Charm Monster", endsWhenHarmed: harmed } },
        { name: "Poisoned", source: { id: "mage", spell: "Other" } },
      ],
    });
  const mage = () => combatant("mage", { hp: 20, max_hp: 20, faction_id: "good", concentration: { spellId: null, spellName: "Bless", castAtLevel: 1, startedRound: 1, appliedEffectIds: ["x"] } });
  const friend = () => combatant("friend", { faction_id: "good" });
  const enemy = () => combatant("enemy", { faction_id: "foes" });
  const hit = (t: ReturnType<typeof table>, by: RunCombatant | undefined, amount = 5, type: "fire" | null = null, defenses = emptyDefenses()) =>
    applyDamage(t.ctx, { target: t.get("victim"), parts: [{ amount, type }], defenses, attacker: by });
  const names = (t: ReturnType<typeof table>) => t.get("victim").conditions.map((c) => c.name);
  const setup = (harmed?: "source_side" | "anyone", sides?: "unknown") => table([charmed(harmed), mage(), friend(), enemy()], { dice: scripted([]).dice, sides });

  // Bug caught: the caster's own blow leaves the charm in place.
  it("ends when the one who imposed it damages the bearer, and leaves its other conditions", () => {
    const t = setup();
    hit(t, t.get("mage"));
    expect(names(t)).toEqual(["Poisoned"]);
  });

  // Bug caught: only the source itself counts, so "you or your allies" never reaches an ally.
  it("ends when an ally of the source damages the bearer", () => {
    const t = setup();
    hit(t, t.get("friend"));
    expect(names(t)).toEqual(["Poisoned"]);
  });

  // Bug caught: any damage ends a source-side charm, so the bearer's own friends break the spell by hitting it.
  it("does not end when a creature of the other side damages the bearer", () => {
    const t = setup();
    hit(t, t.get("enemy"));
    expect(names(t)).toEqual(["Charmed", "Poisoned"]);
  });

  // Bug caught: the "anyone" ending is treated like a source-side one.
  it("ends on damage from anyone when the condition says so", () => {
    const t = setup("anyone");
    hit(t, t.get("enemy"));
    expect(names(t)).toEqual(["Poisoned"]);
  });

  // Bug caught: a blow that dealt nothing (immune) still breaks the charm.
  it("ends nothing when the blow came to nothing", () => {
    const t = setup();
    hit(t, t.get("mage"), 5, "fire", { ...emptyDefenses(), immunities: [{ types: ["fire"] }] });
    expect(t.hp("victim")).toBe(40);
    expect(names(t)).toEqual(["Charmed", "Poisoned"]);
  });

  // Bug caught: a context that cannot tell sides treats every attacker as an ally of the source.
  it("counts only the source itself as its side where the context cannot tell sides", () => {
    const t = setup("source_side", "unknown");
    hit(t, t.get("friend"));
    expect(names(t)).toEqual(["Charmed", "Poisoned"]);
    hit(t, t.get("mage"));
    expect(names(t)).toEqual(["Poisoned"]);
  });

  // Bug caught: damage with no attacker (ongoing damage) breaks a charm that only the source's side may break.
  it("does not end a source-side condition when nobody dealt the damage", () => {
    const t = setup();
    hit(t, undefined);
    expect(names(t)).toEqual(["Charmed", "Poisoned"]);
  });

  // Bug caught: ending the charm ends the caster's concentration on something else.
  it("leaves the source's concentration alone", () => {
    const t = setup();
    hit(t, t.get("mage"));
    expect(t.get("mage").concentration).not.toBeNull();
  });
});
