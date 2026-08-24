import { describe, it, expect } from "vitest";
import { deriveInitiativeMiniState } from "./initiativeMini";
import type { EncounterState, RunCombatant } from "@/types/encounter.types";

/** Mirrors the helper in `combatantSort.test.ts` so the tie-break fixtures
 *  here line up with the ones that pin the runner's own comparator. */
function c(partial: Partial<RunCombatant> & Pick<RunCombatant, "instance_id">): RunCombatant {
  return {
    type: "monster",
    name: partial.instance_id,
    faction_id: "f",
    initiative: null,
    hp: 10,
    max_hp: 10,
    ac: "10",
    conditions: [],
    curses: [],
    death_saves: { successes: 0, failures: 0 },
    dex_mod: 0,
    ...partial,
  } as RunCombatant;
}

function state(partial: Partial<EncounterState> & { combatants_live: RunCombatant[] }): EncounterState {
  return {
    id: "state-1",
    encounter_id: "enc-1",
    campaign_id: "campaign-1",
    user_id: "dm-1",
    is_running: true,
    current_round: 1,
    active_combatant_index: 0,
    events_fired: [],
    started_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("deriveInitiativeMiniState", () => {
  it("returns null when there is no live encounter at all", () => {
    expect(deriveInitiativeMiniState(null)).toBeNull();
  });

  it("returns null when the row is not marked running", () => {
    const s = state({
      is_running: false,
      combatants_live: [c({ instance_id: "a", initiative: 10 })],
    });
    expect(deriveInitiativeMiniState(s)).toBeNull();
  });

  it("returns null when a running encounter has no combatants", () => {
    const s = state({ combatants_live: [] });
    expect(deriveInitiativeMiniState(s)).toBeNull();
  });

  it("derives round, ordering, the active row and the next row mid-round", () => {
    const s = state({
      current_round: 3,
      active_combatant_index: 1, // "b" (initiative 15) is active once sorted
      active_combatant_instance_id: "b",
      combatants_live: [
        c({ instance_id: "a", type: "player", initiative: 10 }),
        c({ instance_id: "b", type: "player", initiative: 15 }),
        c({ instance_id: "c", type: "monster", initiative: 20 }),
      ],
    });
    const result = deriveInitiativeMiniState(s);
    expect(result).not.toBeNull();
    expect(result?.round).toBe(3);
    expect(result?.encounterId).toBe("enc-1");
    // Sorted by initiative descending: c(20), b(15), a(10)
    expect(result?.rows.map((r) => r.instanceId)).toEqual(["c", "b", "a"]);

    const active = result?.rows.find((r) => r.instanceId === "b");
    expect(active?.isActive).toBe(true);
    expect(active?.isNext).toBe(false);

    // "next" walks forward through the sorted order: c, b, a -> after b comes a.
    const next = result?.rows.find((r) => r.instanceId === "a");
    expect(next?.isNext).toBe(true);
    expect(result?.rows.find((r) => r.instanceId === "c")?.isNext).toBe(false);
  });

  it("wraps next to the first combatant when the active one is last in the order", () => {
    const s = state({
      active_combatant_index: 2, // "a" (initiative 10) is last once sorted
      combatants_live: [
        c({ instance_id: "a", type: "player", initiative: 10 }),
        c({ instance_id: "b", type: "player", initiative: 15 }),
        c({ instance_id: "c", type: "monster", initiative: 20 }),
      ],
    });
    const result = deriveInitiativeMiniState(s);
    expect(result?.rows.map((r) => r.instanceId)).toEqual(["c", "b", "a"]);
    expect(result?.rows.find((r) => r.instanceId === "a")?.isActive).toBe(true);
    // Wraps past the end of the round back to the top of the order.
    expect(result?.rows.find((r) => r.instanceId === "c")?.isNext).toBe(true);
    expect(result?.rows.find((r) => r.instanceId === "b")?.isNext).toBe(false);
  });

  it("marks a combatant at 0 HP as downed, and skips a downed MONSTER when computing next", () => {
    const s = state({
      active_combatant_index: 0, // "c" (initiative 20) is active
      combatants_live: [
        c({ instance_id: "c", type: "monster", initiative: 20 }),
        c({ instance_id: "b", type: "monster", initiative: 15, hp: 0 }), // downed monster
        c({ instance_id: "a", type: "player", initiative: 10 }),
      ],
    });
    const result = deriveInitiativeMiniState(s);
    const downed = result?.rows.find((r) => r.instanceId === "b");
    expect(downed?.hpState).toBe("downed");
    // A downed monster no longer acts, so "next" skips straight past it to the player.
    expect(downed?.isNext).toBe(false);
    expect(result?.rows.find((r) => r.instanceId === "a")?.isNext).toBe(true);
  });

  it("does NOT skip a downed PLAYER when computing next — they still roll death saves", () => {
    const s = state({
      active_combatant_index: 0, // "c" is active
      combatants_live: [
        c({ instance_id: "c", type: "monster", initiative: 20 }),
        c({ instance_id: "b", type: "player", initiative: 15, hp: 0 }), // downed player
        c({ instance_id: "a", type: "player", initiative: 10 }),
      ],
    });
    const result = deriveInitiativeMiniState(s);
    const downedPlayer = result?.rows.find((r) => r.instanceId === "b");
    expect(downedPlayer?.hpState).toBe("downed");
    expect(downedPlayer?.isNext).toBe(true);
  });

  it("breaks a same-initiative tie exactly like the runner: players before monsters", () => {
    const s = state({
      active_combatant_index: 0,
      combatants_live: [
        c({ instance_id: "mon", type: "monster", initiative: 12 }),
        c({ instance_id: "pc", type: "player", initiative: 12 }),
      ],
    });
    const result = deriveInitiativeMiniState(s);
    expect(result?.rows.map((r) => r.instanceId)).toEqual(["pc", "mon"]);
  });

  it("breaks a same-type initiative tie on the higher declared initiative modifier", () => {
    const s = state({
      active_combatant_index: 0,
      combatants_live: [
        c({ instance_id: "low", type: "monster", initiative: 12, dex_mod: 1 }),
        c({ instance_id: "high", type: "monster", initiative: 12, dex_mod: 3 }),
      ],
    });
    const result = deriveInitiativeMiniState(s);
    expect(result?.rows.map((r) => r.instanceId)).toEqual(["high", "low"]);
  });

  it("marks half-HP-or-under as bloodied and full HP as healthy", () => {
    const s = state({
      active_combatant_index: 0,
      combatants_live: [
        c({ instance_id: "full", initiative: 10, hp: 10, max_hp: 10 }),
        c({ instance_id: "half", initiative: 9, hp: 5, max_hp: 10 }),
        c({ instance_id: "hurt", initiative: 8, hp: 9, max_hp: 10 }),
      ],
    });
    const result = deriveInitiativeMiniState(s);
    expect(result?.rows.find((r) => r.instanceId === "full")?.hpState).toBe("healthy");
    expect(result?.rows.find((r) => r.instanceId === "half")?.hpState).toBe("bloodied");
    expect(result?.rows.find((r) => r.instanceId === "hurt")?.hpState).toBe("healthy");
  });

  it("clamps an out-of-range active_combatant_index instead of crashing", () => {
    const s = state({
      active_combatant_index: 99,
      combatants_live: [
        c({ instance_id: "a", initiative: 10 }),
        c({ instance_id: "b", initiative: 20 }),
      ],
    });
    const result = deriveInitiativeMiniState(s);
    expect(result?.rows).toHaveLength(2);
    // Clamped to the last row rather than leaving nothing marked active.
    expect(result?.rows.some((r) => r.isActive)).toBe(true);
  });

  it("never marks the same row both active and next when only one combatant can still act", () => {
    const s = state({
      active_combatant_index: 0,
      combatants_live: [c({ instance_id: "solo", type: "player", initiative: 10 })],
    });
    const result = deriveInitiativeMiniState(s);
    expect(result?.rows).toHaveLength(1);
    expect(result?.rows[0]?.isActive).toBe(true);
    expect(result?.rows[0]?.isNext).toBe(false);
  });
});
