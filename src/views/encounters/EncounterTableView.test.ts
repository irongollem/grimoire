// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { mount } from "@vue/test-utils";
import { defineComponent, ref } from "vue";
import type { RunCombatant } from "@/types/encounter.types";

const h = await vi.hoisted(async () => {
  const { ref: vueRef } = await import("vue");
  return { combatants: vueRef<unknown[]>([]), fog: vueRef(new Set<string>()), active: vueRef<string | null>(null), round: vueRef(3) };
});

vi.mock("vue-router", async (importOriginal) => ({ ...(await importOriginal<typeof import("vue-router")>()), useRoute: () => ({ params: { id: "e1" } }) }));
vi.mock("@/components/encounters/play/usePlayMapState", () => ({
  usePlayMapState: () => ({
    surface: ref({ calibration: {} }), combatants: h.combatants, fogMask: h.fog, activeInstanceId: h.active, round: h.round,
    factions: ref([]), monsters: ref([]), doorStates: ref([]), darknessZones: ref([]), loadingState: ref(null),
  }),
}));
vi.mock("@/composables/npcs/useNpcs", () => ({ useNpcs: () => ({ data: ref([]) }) }));

import { useAppUiStore } from "@/stores/ui/app";
import EncounterTableView from "./EncounterTableView.vue";

const Screen = defineComponent({
  name: "TableScreen",
  props: ["combatants", "order", "eyebrow", "title", "follow", "activeInstanceId"],
  template: "<div />",
});

function mk(over: Partial<RunCombatant> & Pick<RunCombatant, "instance_id" | "name">): RunCombatant {
  return {
    type: "monster", faction_id: "foes", initiative: 10, hp: 20, max_hp: 40, ac: "12", conditions: [], curses: [],
    death_saves: { successes: 0, failures: 0 }, dex_mod: 0, reveal_state: "revealed", position: { x: 1, y: 1 }, ...over,
  };
}

function screen() {
  const w = mount(EncounterTableView, { global: { stubs: { TableScreen: Screen } } });
  return w.findComponent({ name: "TableScreen" });
}

describe("EncounterTableView", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    h.fog.value = new Set(["1,1", "5,5"]);
    h.active.value = null;
  });

  it("gives the screen no hit points for a monster and no hidden creature at all", () => {
    h.combatants.value = [mk({ instance_id: "m1", name: "Ogre", hp: 9, max_hp: 59 }), mk({ instance_id: "m2", name: "Lurker", reveal_state: "hidden" })];
    const s = screen();
    const drawn = s.props("combatants") as RunCombatant[];
    expect(drawn.map((c) => c.name)).toEqual(["Ogre"]);
    expect(drawn[0].max_hp).toBe(1);
  });

  it("names whose turn it is from the live row, and follows that token", () => {
    h.combatants.value = [mk({ instance_id: "m1", name: "Brakka", position: { x: 5, y: 5 } })];
    h.active.value = "m1";
    const s = screen();
    expect(s.props()).toMatchObject({ eyebrow: "Round 3", title: "Brakka's turn", follow: { position: { x: 5, y: 5 }, footprint: 1 } });
  });

  // A creature the players may not know about must not be followed, or the pan itself would point at it.
  it("neither names nor follows a hidden creature whose turn it is", () => {
    h.combatants.value = [mk({ instance_id: "m1", name: "Lurker", reveal_state: "hidden", position: { x: 5, y: 5 } })];
    h.active.value = "m1";
    const s = screen();
    expect(s.props("title")).toBeNull();
    expect(s.props("follow")).toBeNull();
    expect(s.props("activeInstanceId")).toBeNull();
  });

  it("does not follow an active creature standing in the fog", () => {
    h.combatants.value = [mk({ instance_id: "m1", name: "Brakka", position: { x: 9, y: 9 } })];
    h.active.value = "m1";
    expect(screen().props("follow")).toBeNull();
  });

  it("hides the app chrome while it is open and brings it back after", () => {
    h.combatants.value = [];
    const appUi = useAppUiStore();
    const w = mount(EncounterTableView, { global: { stubs: { TableScreen: Screen } } });
    expect(appUi.editorFocus).toBe(true);
    w.unmount();
    expect(appUi.editorFocus).toBe(false);
  });
});
