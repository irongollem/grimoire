// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { mount } from "@vue/test-utils";
import type { EncounterEvent } from "@/types/encounter.types";
import type { TrapEntry } from "@/types/trap.types";
import RunnerDmTools from "./RunnerDmTools.vue";
import { useEncounterRunStore } from "@/stores/encounterRun";

const event = (id: string, fireOnce: boolean, actions: EncounterEvent["actions"] = []): EncounterEvent => ({
  id,
  name: id,
  trigger: { type: "manual" },
  actions,
  fire_once: fireOnce,
});

function mountTools(selectedTrapId: string | null = null) {
  return mount(RunnerDmTools, { props: { selectedTrapId } });
}

const fireButtons = (w: ReturnType<typeof mountTools>) =>
  w.findAll("[data-testid=runner-event-fire]").map((b) => b.attributes("aria-label"));

describe("RunnerDmTools", () => {
  beforeEach(() => setActivePinia(createPinia()));

  // 30 Oct 2026: the Events column was drawn for every fight, events or not, and
  // took the width the initiative rows needed.
  it("draws nothing for a fight with no events, hazards or traps", () => {
    expect(mountTools().find("section").exists()).toBe(false);
  });

  it("keeps a standing hazard on screen, in full, after the event that raised it has fired", async () => {
    const store = useEncounterRunStore();
    store.events = [event("quake", true, [{ type: "environment_effect", label: "Falling rocks", description: "DEX save each turn" }])];
    store.fireEvent("quake");
    const w = mountTools();
    const hazard = w.find("[data-testid=runner-hazards]").text();
    expect(hazard).toContain("Falling rocks");
    expect(hazard).toContain("DEX save each turn");
    expect(fireButtons(w)).toEqual([]);
  });

  it("takes the fire button off a once-only event that has fired, and keeps it on a repeatable one", async () => {
    const store = useEncounterRunStore();
    store.events = [event("ambush", true), event("tremor", false)];
    const w = mountTools();
    expect(fireButtons(w)).toEqual(["Fire ambush", "Fire tremor"]);

    await w.find("[aria-label='Fire ambush']").trigger("click");
    await w.find("[aria-label='Fire tremor']").trigger("click");
    expect(store.eventsFired).toEqual(["ambush", "tremor"]);
    expect(fireButtons(w)).toEqual(["Fire tremor"]);
  });

  it("opens a trap's detail on the first click and closes it on the second", async () => {
    const store = useEncounterRunStore();
    store.traps = [{ id: "t1", name: "Pit" } as TrapEntry];
    const closed = mountTools(null);
    await closed.find("[aria-label=Pit]").trigger("click");
    expect(closed.emitted("update:selectedTrapId")).toEqual([["t1"]]);

    const open = mountTools("t1");
    await open.find("[aria-label=Pit]").trigger("click");
    expect(open.emitted("update:selectedTrapId")).toEqual([[null]]);
  });
});
