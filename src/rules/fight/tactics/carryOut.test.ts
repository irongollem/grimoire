import { describe, expect, it } from "vitest";
import type { StatBlockEntry } from "@/types/statBlock.types";
import type { TurnOption, TurnOptionKind, UsableAttack } from "../terrain/options/types";
import { stepsFor } from "./carryOut";

const entry = (name: string, extra: Record<string, unknown> = {}): StatBlockEntry => ({
  name,
  description: "",
  structured: { kind: "attack", source: "manual", attack: { delivery: "melee", bonus: 4, hit: [] }, ...extra },
});
const usable = (list: "actions" | "bonus_actions", e: StatBlockEntry): UsableAttack => ({ list, entry: e });

function option(kind: TurnOptionKind, over: Partial<TurnOption> = {}): TurnOption {
  return {
    id: kind, kind, targetId: null, destination: null, path: null, feet: null, attack: null, distanceFeet: null,
    provokes: [], exposure: [], summary: kind, ...over,
  };
}
const strike = (list: "actions" | "bonus_actions", action: string, steps: { action: string; count: number }[] | null = null) => ({
  list, action, steps, distanceFeet: 5, cover: null, longRange: null, closeCombat: null, hitChance: null, expectedDamage: null,
});

describe("stepsFor", () => {
  // The wolf stands at (0,0) and walks three squares to (3,0), 15 ft, then bites the hero. The attack is made from where it ends, so the move is first.
  it("fails if the move does not come first, or loses the destination or the feet", () => {
    const bite = entry("Bite");
    const steps = stepsFor(
      option("attack", {
        targetId: "hero", destination: { x: 3, y: 0 }, feet: 15,
        path: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }],
        attack: strike("actions", "Bite"),
      }),
      [usable("actions", bite)],
    );
    expect(steps).toEqual([
      { type: "move", to: { x: 3, y: 0 }, feet: 15 },
      { type: "swing", list: "actions", action: "Bite", targetId: "hero" },
      { type: "use", slot: "action" },
    ]);
  });

  // The goblin runs five squares to the gate at (5,0), 25 ft, spends its Action, and only then is out of the fight.
  it("fails if a flee that leaves the map does not end with the leave, after the move and the Action", () => {
    const flee = option("flee", { destination: { x: 5, y: 0 }, feet: 25, path: [{ x: 0, y: 0 }, { x: 5, y: 0 }], leavesMap: true });
    expect(stepsFor(flee, [])).toEqual([
      { type: "move", to: { x: 5, y: 0 }, feet: 25 },
      { type: "use", slot: "action" },
      { type: "leave" },
    ]);
  });

  it("fails if a flee that only runs toward a way off, or any other turn, is told to leave", () => {
    const flee = option("flee", { destination: { x: 5, y: 0 }, feet: 25, path: [{ x: 0, y: 0 }, { x: 5, y: 0 }], leavesMap: false });
    expect(stepsFor(flee, []).some((s) => s.type === "leave")).toBe(false);
    // A dash that happens to carry the flag is still not a flee.
    expect(stepsFor(option("dash", { leavesMap: true, destination: { x: 5, y: 0 }, feet: 25, path: [{ x: 0, y: 0 }, { x: 5, y: 0 }] }), []).some((s) => s.type === "leave")).toBe(false);
  });

  it("fails if a creature that stays where it is (a path of one cell, or none) is told to move", () => {
    const stay = stepsFor(option("dodge", { destination: { x: 1, y: 1 }, path: [{ x: 1, y: 1 }], feet: 0 }), []);
    expect(stay).toEqual([{ type: "stance", name: "Dodging" }, { type: "use", slot: "action" }]);
    expect(stepsFor(option("hide"), [])).toEqual([{ type: "use", slot: "action" }]);
  });

  // PHB 2014 "Dodge" / "Disengage": each is an Action that puts its stance on the creature. The bug is an Action spent with no stance.
  it("fails if Dodge or Disengage yields no stance step, or Hide or an attack yields one", () => {
    expect(stepsFor(option("dodge"), [])).toEqual([{ type: "stance", name: "Dodging" }, { type: "use", slot: "action" }]);
    expect(stepsFor(option("disengage"), [])).toEqual([{ type: "stance", name: "Disengaged" }, { type: "use", slot: "action" }]);
    expect(stepsFor(option("dash"), []).some((s) => s.type === "stance")).toBe(false);
  });

  // SRD 5.2 "Disengage [Action]": the walk away must not provoke, so the stance has to be on the creature before the move.
  it("fails if the Disengaged stance comes after the move", () => {
    const steps = stepsFor(option("disengage", { destination: { x: 2, y: 0 }, feet: 10, path: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }] }), []);
    expect(steps.map((s) => s.type)).toEqual(["stance", "move", "use"]);
  });

  // Multiattack: one Bite then two Claws is three swings, each named from the entry the step points at, in printed order.
  it("fails if a Multiattack does not make every swing of every step, in printed order, from the entry's own list", () => {
    const multi = entry("Multiattack", { kind: "multiattack" });
    const steps = stepsFor(
      option("attack", {
        targetId: "hero",
        attack: strike("actions", "Multiattack", [{ action: "Bite", count: 1 }, { action: "Claw", count: 2 }]),
      }),
      [usable("actions", multi), usable("actions", entry("Bite")), usable("bonus_actions", entry("Claw"))],
    );
    expect(steps.map((s) => (s.type === "swing" ? `${s.list}/${s.action}` : s.type))).toEqual([
      "actions/Bite", "bonus_actions/Claw", "bonus_actions/Claw", "use",
    ]);
  });

  it("fails if an attack from the Bonus Action list uses up the Action instead, or the other way round", () => {
    const nip = entry("Nip");
    const bonus = stepsFor(option("attack", { targetId: "hero", attack: strike("bonus_actions", "Nip") }), [usable("bonus_actions", nip)]);
    expect(bonus.at(-1)).toEqual({ type: "use", slot: "bonus" });
    const action = stepsFor(option("attack", { targetId: "hero", attack: strike("actions", "Nip") }), [usable("actions", nip)]);
    expect(action.at(-1)).toEqual({ type: "use", slot: "action" });
  });

  // A Recharge 5-6 breath is spent with the runner's own limit shape, so it is not offered again; a plain bite spends nothing.
  it("fails if a recharge ability is not spent, or an unlimited one is", () => {
    const breath = entry("Breath", { recharge: { min: 5, max: 6 } });
    const limited = stepsFor(option("attack", { targetId: "hero", attack: strike("actions", "Breath") }), [usable("actions", breath)]);
    expect(limited).toContainEqual({ type: "spend", useKey: "actions/Breath", limit: { recharge: { min: 5, max: 6 } } });
    const plain = stepsFor(option("attack", { targetId: "hero", attack: strike("actions", "Bite") }), [usable("actions", entry("Bite"))]);
    expect(plain.some((s) => s.type === "spend")).toBe(false);
  });

  it("fails if a kind of turn uses the wrong slot: only dash, flee, disengage, dodge and hide use the Action; move and surrender use nothing", () => {
    const used = (kind: TurnOptionKind) => stepsFor(option(kind), []).some((s) => s.type === "use");
    expect(["dash", "flee", "disengage", "dodge", "hide"].map((k) => used(k as TurnOptionKind))).toEqual([true, true, true, true, true]);
    expect(used("move")).toBe(false);
    expect(used("surrender")).toBe(false);
  });
});

describe("stepsFor: an escape", () => {
  const escape = (over: Partial<NonNullable<TurnOption["escape"]>>): TurnOption =>
    option("escape", { escape: { name: "Etherealness", effect: "leaves", slot: "action", useKey: null, limit: null, ...over } });

  // SRD 5.1 night hag: Etherealness is an Action and takes her out of the fight; no walk comes with it.
  it("fails if an unlimited way out that leaves is not use then leave, or walks first", () => {
    expect(stepsFor(escape({}), [])).toEqual([{ type: "use", slot: "action" }, { type: "leave" }]);
  });

  it("fails if a limited way out does not spend between the use and the leave, in that order", () => {
    const limit = { per_day: 2 };
    expect(stepsFor(escape({ name: "Plane Shift", useKey: "spell/plane shift", limit }), [])).toEqual([
      { type: "use", slot: "action" },
      { type: "spend", useKey: "spell/plane shift", limit },
      { type: "leave" },
    ]);
  });

  it("fails if an unseen way out leaves the fight instead of turning the creature Invisible, or costs the wrong slot", () => {
    expect(stepsFor(escape({ name: "Invisible Passage", effect: "unseen", slot: "bonus" }), [])).toEqual([
      { type: "use", slot: "bonus" },
      { type: "condition", name: "Invisible" },
    ]);
  });
});

describe("stepsFor: break free (#1021)", () => {
  // The check is one command that takes the Action itself, like a cast: a `use` step beside it would spend the Action twice.
  // Bug caught: the step is missing, so the turn does nothing, or a `use` step goes with it.
  it("is one break_free step naming the condition and the ability, with no use step", () => {
    const steps = stepsFor(option("break_free", { id: "break_free:Restrained", breakFree: { name: "Restrained", ability: "dex" } }), []);
    expect(steps).toEqual([{ type: "break_free", name: "Restrained", ability: "dex" }]);
  });
});
