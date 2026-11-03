// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, ref } from "vue";
import type { RunCombatant } from "@/types/encounter.types";

const h = await vi.hoisted(async () => {
  const { ref: vueRef } = await import("vue");
  return {
    combatants: vueRef<unknown[]>([]),
    memory: vueRef(new Set<string>()),
    sight: vueRef(new Set<string>()),
    active: vueRef<string | null>(null),
    imageSize: null as unknown,
  };
});

vi.mock("@/components/encounters/play/usePlayMapState", () => ({
  usePlayMapState: (_id: unknown, mode: string, size: unknown) => {
    h.imageSize = { mode, size };
    return {
      surface: ref({ calibration: {} }), combatants: h.combatants, memory: h.memory, sight: h.sight, viewers: ref([{ x: 1, y: 1 }]),
      activeInstanceId: h.active, round: ref(3), factions: ref([]), monsters: ref([]), doorStates: ref([]), darknessZones: ref([]),
      loadingState: ref(null),
    };
  },
}));
vi.mock("@/composables/npcs/useNpcs", () => ({ useNpcs: () => ({ data: ref([]) }) }));

import MapTableFight from "./MapTableFight.vue";

const Screen = defineComponent({
  name: "TableScreen",
  props: ["combatants", "fogMask", "seen", "viewers", "order", "eyebrow", "title", "follow"],
  template: "<div />",
});

function mk(over: Partial<RunCombatant> & Pick<RunCombatant, "instance_id" | "name">): RunCombatant {
  return {
    type: "monster", faction_id: "foes", initiative: 10, hp: 20, max_hp: 40, ac: "12", conditions: [], curses: [],
    death_saves: { successes: 0, failures: 0 }, dex_mod: 0, reveal_state: "revealed", position: { x: 1, y: 1 }, ...over,
  };
}

function screen() {
  return mount(MapTableFight, { props: { encounterId: "e1" }, global: { stubs: { TableScreen: Screen } } }).findComponent({ name: "TableScreen" });
}

describe("MapTableFight", () => {
  beforeEach(() => {
    h.memory.value = new Set();
    h.sight.value = new Set(["1,1"]);
    h.active.value = null;
  });

  it("follows the live row without writing: the window is a follower", () => {
    screen();
    expect((h.imageSize as { mode: string }).mode).toBe("follower");
  });

  // Decision 5: a monster the party cannot see is not on the TV, while every player's coin always is.
  it("draws a monster only where the party sees it, and every player wherever they stand", () => {
    h.combatants.value = [
      mk({ instance_id: "seen", name: "Ogre", position: { x: 1, y: 1 } }),
      mk({ instance_id: "dark", name: "Lurker", position: { x: 9, y: 9 } }),
      mk({ instance_id: "pc", name: "Tamsin", type: "player", position: { x: 8, y: 8 } }),
    ];
    expect((screen().props("combatants") as RunCombatant[]).map((c) => c.instance_id)).toEqual(["seen", "pc"]);
  });

  it("keeps the unseen monster in the ribbon's order even while its token is not drawn", () => {
    h.combatants.value = [mk({ instance_id: "dark", name: "Lurker", position: { x: 9, y: 9 } })];
    expect((screen().props("order") as RunCombatant[]).map((c) => c.instance_id)).toEqual(["dark"]);
  });

  it("shows no hit points for a monster and no hidden creature at all", () => {
    h.combatants.value = [mk({ instance_id: "seen", name: "Ogre", hp: 9, max_hp: 59 }), mk({ instance_id: "h", name: "Lurker", reveal_state: "hidden" })];
    const drawn = screen().props("combatants") as RunCombatant[];
    expect(drawn.map((c) => c.name)).toEqual(["Ogre"]);
    expect(drawn[0].max_hp).toBe(1);
  });

  it("shows what the map remembers plus what is seen now, and hands over the party's viewers", () => {
    h.memory.value = new Set(["5,5"]);
    const s = screen();
    expect([...(s.props("fogMask") as Set<string>)].sort()).toEqual(["1,1", "5,5"]);
    expect([...(s.props("seen") as Set<string>)]).toEqual(["1,1"]);
    expect(s.props("viewers")).toEqual([{ x: 1, y: 1 }]);
  });

  it("names whose turn it is and follows that token", () => {
    h.combatants.value = [mk({ instance_id: "seen", name: "Brakka", position: { x: 1, y: 1 } })];
    h.active.value = "seen";
    const s = screen();
    expect(s.props("eyebrow")).toBe("Round 3");
    expect(s.props("title")).toBe("Brakka's turn");
    expect(s.props("follow")).toMatchObject({ position: { x: 1, y: 1 } });
  });

  it("follows nobody while the one up stands where the party cannot see", () => {
    h.combatants.value = [mk({ instance_id: "dark", name: "Lurker", position: { x: 9, y: 9 } })];
    h.active.value = "dark";
    expect(screen().props("follow")).toBeNull();
  });
});
