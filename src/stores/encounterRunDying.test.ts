import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useEncounterRunStore } from "@/stores/encounterRun";
import type { RunCombatant } from "@/types/encounter.types";

function player(hp: number, max = 10): RunCombatant {
  return {
    instance_id: "p-1",
    type: "player",
    name: "Nessa",
    faction_id: "f",
    initiative: 10,
    hp,
    max_hp: max,
    ac: "12",
    conditions: [],
    curses: [],
    death_saves: { successes: 0, failures: 0 },
    party_member_id: "pm-1",
    dex_mod: 0,
  };
}

describe("runner adjustHp for a player combatant", () => {
  const persist = vi.fn();
  beforeEach(() => {
    setActivePinia(createPinia());
    persist.mockReset();
  });

  function setup(c: RunCombatant) {
    const store = useEncounterRunStore();
    store.setPersistHandler(persist);
    store.combatants = [c];
    return store;
  }

  it("instant death writes three failures", () => {
    const store = setup(player(10));
    expect(store.adjustHp("p-1", -25)).toBe("died");
    expect(persist).toHaveBeenCalledWith("pm-1", expect.objectContaining({ current_hp: 0, death_save_failures: 3 }));
  });

  it("dropping adds Unconscious, and healing removes it with the saves", () => {
    const store = setup(player(10));
    expect(store.adjustHp("p-1", -12)).toBe("dropped");
    expect(store.combatants[0]!.conditions).toContain("Unconscious");
    store.adjustHp("p-1", -3);
    expect(store.combatants[0]!.death_saves.failures).toBe(1);
    expect(store.adjustHp("p-1", 2)).toBe("revived-by-healing");
    expect(store.combatants[0]!.death_saves).toEqual({ successes: 0, failures: 0 });
    expect(store.combatants[0]!.conditions).not.toContain("Unconscious");
  });

  it("an ordinary hit on a conscious player writes HP only, not the runner's copy of their conditions", () => {
    const store = setup({ ...player(10), conditions: ["Prone"] });
    store.adjustHp("p-1", -3);
    const patch = persist.mock.calls[0]![1] as Record<string, unknown>;
    expect(patch).toMatchObject({ current_hp: 7 });
    expect(patch).not.toHaveProperty("conditions");
    expect(patch).not.toHaveProperty("death_save_failures");
  });

  it("monsters just floor at 0", () => {
    const m = { ...player(5), type: "monster" as const, party_member_id: undefined };
    const store = setup(m);
    expect(store.adjustHp("p-1", -50)).toBeNull();
    expect(store.combatants[0]!.hp).toBe(0);
    expect(store.combatants[0]!.conditions).toEqual([]);
  });
});
