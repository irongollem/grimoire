// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";
import type { MapLiveDoor } from "@/types/mapLive.types";
import type { RunCombatant } from "@/types/encounter.types";

const h = vi.hoisted(() => ({
  isLive: { value: false },
  liveState: { value: null as unknown },
  scheduleMapPush: vi.fn(),
  moveToken: vi.fn(() => Promise.resolve()),
  surface: { value: null as unknown },
  zones: { value: [] as { region: unknown; battleCells: string[] }[] },
}));

vi.mock("@/composables/encounters/useEncounterRoom", () => ({
  useEncounterRoom: () => ({
    encounter: ref({ id: "e1", location_id: "l1", factions: [] }),
    location: ref({ id: "l1", location_type: "region" }),
    mapLocation: ref({ id: "l1" }),
    surface: h.surface,
    focusRoom: ref(null),
    terrainZones: h.zones,
  }),
}));
vi.mock("@/composables/encounters/useEncounterLive", () => ({
  useEncounterLive: () => ({
    isLive: h.isLive,
    liveStateLoaded: ref(true),
    scheduleMapPush: h.scheduleMapPush,
    moveToken: h.moveToken,
  }),
  liveState: h.liveState,
}));
vi.mock("@/composables/monsters/useMonstersByIds", () => ({ useMonstersByIds: () => ({ data: ref(new Map()) }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: vi.fn(), fromError: vi.fn() }) }));

import { usePlayMapState } from "./usePlayMapState";
import { useEncounterRunStore } from "@/stores/encounterRun";

function combatant(id: string, position?: { x: number; y: number }): RunCombatant {
  return {
    instance_id: id, type: "monster", name: id, faction_id: "f", initiative: 10, hp: 10, max_hp: 10, ac: "12",
    conditions: [], curses: [], death_saves: { successes: 0, failures: 0 }, dex_mod: 0, position,
  };
}

const door: MapLiveDoor = { id: "3,2:N", a: [3, 2], b: [4, 2], open: false, leaf: null };

function setup(mode: "dm" | "follower" = "dm") {
  return usePlayMapState(ref("e1"), mode);
}

describe("usePlayMapState", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    h.isLive.value = false;
    h.liveState.value = null;
    h.zones.value = [];
    h.surface.value = {
      focusRoomId: null, focusCells: [], mapLocation: { id: "l1", is_battle_map: true },
      calibration: { cells_per_image_width: 10, origin_x_pct: 0, origin_y_pct: 0 },
      live: { doors: [door] },
    };
  });

  // #1125 frame 10: "doors toggle by clicking a door in ANY tool", so the click must find the door and nothing else.
  it("flips the door under the click and leaves the other doors and clicks alone", () => {
    h.isLive.value = true;
    const s = setup();
    expect(s.toggleDoorAt(3.5, 2.1)).toBe(true);
    expect(s.doorStates.value).toEqual([{ id: "3,2:N", open: true }]);
    expect(h.scheduleMapPush).toHaveBeenCalledWith({ doorStates: [{ id: "3,2:N", open: true }] });

    h.scheduleMapPush.mockClear();
    expect(s.toggleDoorAt(8, 8)).toBe(false);
    expect(h.scheduleMapPush).not.toHaveBeenCalled();
  });

  it("does not push anything before the fight is live", () => {
    const s = setup();
    s.toggleDoorAt(3.5, 2.1);
    s.toggleDarknessAt(2, 2, 15);
    s.paintFog(new Set(["1,1"]), "reveal");
    expect(h.scheduleMapPush).not.toHaveBeenCalled();
  });

  it("a second click inside a darkness sphere removes it instead of stacking another", () => {
    const s = setup();
    s.toggleDarknessAt(5, 5, 15);
    expect(s.darknessZones.value).toHaveLength(1);
    s.toggleDarknessAt(5.2, 5.1, 15);
    expect(s.darknessZones.value).toHaveLength(0);
  });

  it("the Reveal brush opens cells and the Hide brush closes them again", () => {
    const s = setup();
    s.paintFog(new Set(["1,1", "2,1"]), "reveal");
    expect([...s.fogMask.value].sort()).toEqual(["1,1", "2,1"]);
    s.paintFog(new Set(["1,1"]), "hide");
    expect([...s.fogMask.value]).toEqual(["2,1"]);
  });

  // The tray lists exactly who the map has no square for.
  it("lists only the combatants with no position as unplaced, and draws only the placed", () => {
    const store = useEncounterRunStore();
    store.combatants = [combatant("a", { x: 1, y: 1 }), combatant("b"), combatant("c", { x: 0, y: 0 })];
    const s = setup();
    expect(s.unplaced.value.map((c) => c.instance_id)).toEqual(["b"]);
    expect(s.placed.value.map((c) => c.instance_id)).toEqual(["a", "c"]);
  });

  // Live, positions live on the row; the runner's store does not hear players' moves.
  it("reads positions from the live row while live, not from the runner's store", () => {
    const store = useEncounterRunStore();
    store.combatants = [combatant("a")];
    h.isLive.value = true;
    h.liveState.value = { combatants_live: [combatant("a", { x: 4, y: 4 })], fog_mask: "", current_round: 1, active_combatant_index: 0 };
    expect(setup().unplaced.value).toEqual([]);
  });

  it("moves a token in the runner's store before going live, and through the row once live", () => {
    const store = useEncounterRunStore();
    store.combatants = [combatant("a")];
    const s = setup();
    s.moveCombatant("a", { x: 2, y: 3 });
    expect(store.combatants[0].position).toEqual({ x: 2, y: 3 });
    expect(h.moveToken).not.toHaveBeenCalled();

    h.isLive.value = true;
    s.moveCombatant("a", { x: 5, y: 5 });
    expect(h.moveToken).toHaveBeenCalledWith("a", { x: 5, y: 5 });
  });

  // #1120: the second window never builds the runner's store, so before going live it has no fight to draw.
  it("a follower window draws nothing from the runner's store", () => {
    const store = useEncounterRunStore();
    store.combatants = [combatant("a", { x: 1, y: 1 })];
    expect(setup("follower").placed.value).toEqual([]);
    expect(setup("dm").placed.value).toHaveLength(1);
  });

  // #1125 decision 11: the move counter prices difficult ground and squeezes from what the map itself draws.
  it("prices a move by the difficult zones on the map and the walls and closed doors a big token can wedge in", () => {
    h.zones.value = [{ region: {}, battleCells: ["2,2", "3,2"] }];
    h.surface.value = {
      ...(h.surface.value as object),
      live: { walls: [{ id: "w", a: [1, 1], b: [1, 3] }], doors: [door], solid: [] },
    };
    const terrain = setup().moveTerrain.value;
    expect([...terrain.difficult].sort()).toEqual(["2,2", "3,2"]);
    expect(terrain.walls.map((w) => w.id).sort()).toEqual(["3,2:N", "w"]);
  });

  it("an open door no longer wedges anyone", () => {
    h.surface.value = { ...(h.surface.value as object), live: { walls: [], doors: [door], solid: [] } };
    const s = setup();
    s.toggleDoorAt(3.5, 2.1);
    expect(s.moveTerrain.value.walls).toEqual([]);
  });
});
