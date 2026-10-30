// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { mount } from "@vue/test-utils";
import type { RunCombatant } from "@/types/encounter.types";
import RunnerTurnBar from "./RunnerTurnBar.vue";
import { useEncounterRunStore } from "@/stores/encounterRun";

function combatant(id: string, initiative: number | null): RunCombatant {
  return {
    instance_id: id, type: "monster", name: `Name ${id}`, faction_id: "f", initiative, hp: 10, max_hp: 10, ac: "12",
    conditions: [], curses: [], death_saves: { successes: 0, failures: 0 }, dex_mod: 0,
  };
}

const stubs = { FocalImage: true };
const button = (w: ReturnType<typeof mount>, text: string) =>
  w.findAll("button").find((b) => b.text().includes(text));

describe("RunnerTurnBar", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    // The lobby: a fresh store starts at round 1, the runner opens at 0.
    useEncounterRunStore().round = 0;
  });

  // The old gate hid Start Combat unless the DM had gone live, so an offline table could never begin.
  it("offers Start combat before round 1 whatever the live state: the bar knows nothing of it", async () => {
    const store = useEncounterRunStore();
    store.combatants = [combatant("a", 12)];
    const w = mount(RunnerTurnBar, { global: { stubs } });
    await button(w, "Start combat")!.trigger("click");
    expect(w.emitted("start-combat")).toHaveLength(1);
  });

  it("offers Roll initiative only while someone has none, and not while a roll is open", async () => {
    const store = useEncounterRunStore();
    store.combatants = [combatant("a", 12), combatant("b", null)];
    const w = mount(RunnerTurnBar, { global: { stubs } });
    expect(button(w, "Roll initiative")).toBeDefined();
    store.rollingInitiative = true;
    await w.vm.$nextTick();
    expect(button(w, "Roll initiative")!.attributes("disabled")).toBeDefined();
    store.rollingInitiative = false;
    store.combatants = [combatant("a", 12), combatant("b", 3)];
    await w.vm.$nextTick();
    expect(button(w, "Roll initiative")).toBeUndefined();
  });

  it("in combat the centre opens the active combatant and shows where the round stands", async () => {
    const store = useEncounterRunStore();
    store.combatants = [combatant("a", 18), combatant("b", 12)];
    store.round = 2;
    store.activeIndex = 1;
    const w = mount(RunnerTurnBar, { global: { stubs } });
    const centre = w.find("[aria-label='Open the active combatant']");
    expect(centre.text()).toContain("Name b");
    expect(centre.text()).toContain("Round 2 · 2 of 2");
    await centre.trigger("click");
    expect(w.emitted("open-active")).toHaveLength(1);
    expect(button(w, "Start combat")).toBeUndefined();
  });

  it("Next and Previous emit their own events, not each other's", async () => {
    const store = useEncounterRunStore();
    store.combatants = [combatant("a", 18)];
    store.round = 1;
    const w = mount(RunnerTurnBar, { global: { stubs } });
    await button(w, "Next")!.trigger("click");
    await w.find("[aria-label='Previous turn']").trigger("click");
    expect(w.emitted("next")).toHaveLength(1);
    expect(w.emitted("prev")).toHaveLength(1);
  });
});
