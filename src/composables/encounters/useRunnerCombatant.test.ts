// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, ref } from "vue";
import type { RunCombatant } from "@/types/encounter.types";

const store = vi.hoisted(() => ({ adjustHp: vi.fn(), setHp: vi.fn(), setMaxHp: vi.fn(), factions: [] }));

vi.mock("@/stores/encounterRun", () => ({ useEncounterRunStore: () => store }));
vi.mock("@/composables/party/useParty", async () => {
  const { ref: r } = await import("vue");
  return { useParty: () => ({ data: r([]) }) };
});
vi.mock("@/composables/party/useActiveParty", async () => {
  const { ref: r } = await import("vue");
  return { useActiveParty: () => ({ data: r([]) }) };
});
vi.mock("@/composables/encounters/useDiscoveredMonsters", () => ({ useAutoDiscoverMonsters: () => ({ mutateAsync: vi.fn() }) }));
vi.mock("@/composables/party/useConcentration", () => ({
  useConcentration: () => ({ rollConcentrationSave: vi.fn(), endConcentration: vi.fn() }),
}));
vi.mock("@/composables/party/useArmorClass", () => ({ useArmorClass: () => ({ acFor: () => 10 }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({}) }));

import { useRunnerCombatant } from "./useRunnerCombatant";

const monster = (instance_id: string, hp = 7): RunCombatant =>
  ({ instance_id, type: "monster", name: instance_id, hp, max_hp: hp, temp_hp: 0, conditions: [] }) as unknown as RunCombatant;

function setup(initial: RunCombatant) {
  const shown = ref(initial);
  const scope = effectScope();
  const api = scope.run(() => useRunnerCombatant(() => shown.value))!;
  return { api, shown, scope };
}

beforeEach(() => {
  vi.useFakeTimers();
  store.adjustHp.mockReset();
  store.setHp.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("useRunnerCombatant: one phone sheet serves every combatant", () => {
  it("lands +/- taps on the combatant they were made on when the sheet switches before the debounce fires", async () => {
    const { api, shown } = setup(monster("goblin"));
    api.handleAdjustHp(-1);
    api.handleAdjustHp(-1);
    api.handleAdjustHp(-1);
    shown.value = monster("orc");
    await nextTick();
    vi.advanceTimersByTime(600);
    expect(store.adjustHp.mock.calls).toEqual([["goblin", -3]]);
  });

  it("does not open the next combatant with the amount typed for the last one", async () => {
    const { api, shown } = setup(monster("goblin"));
    api.quickAmount.value = 8;
    api.quickCritical.value = true;
    shown.value = monster("orc");
    await nextTick();
    expect(api.quickAmount.value).toBe(null);
    expect(api.quickCritical.value).toBe(false);
  });

  it("still writes the taps when the sheet goes away before the debounce fires", () => {
    const { api, scope } = setup(monster("goblin"));
    api.handleAdjustHp(-2);
    scope.stop();
    expect(store.adjustHp.mock.calls).toEqual([["goblin", -2]]);
  });
});

describe("useRunnerCombatant: the HP field", () => {
  it("leaves HP alone when the field is cleared and blurred (it set the monster to 0 and killed it)", () => {
    const { api } = setup(monster("goblin"));
    api.handleSetHp("");
    expect(store.setHp).not.toHaveBeenCalled();
  });

  it("still accepts a typed 0", () => {
    const { api } = setup(monster("goblin"));
    api.handleSetHp("0");
    expect(store.setHp).toHaveBeenCalledWith("goblin", 0);
  });
});
