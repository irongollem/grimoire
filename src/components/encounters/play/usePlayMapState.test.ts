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
  liveArgs: [] as unknown[],
  sightGrid: null as unknown,
  moveToken: vi.fn(() => Promise.resolve()),
  surface: { value: null as unknown },
  zones: { value: [] as { region: unknown; battleCells: string[] }[] },
  regions: { value: [] as unknown[] },
  memory: { value: new Set<string>() },
  remember: vi.fn(() => Promise.resolve()),
  hide: vi.fn(() => Promise.resolve()),
  forgetAll: vi.fn(() => Promise.resolve()),
  replaceWith: vi.fn(() => Promise.resolve()),
  explored: new Set<string>(),
  assert: vi.fn(),
  statesLoaded: { value: true },
}));

vi.mock("@/composables/locations/useMapMemory", () => ({
  useMapMemory: () => ({
    memory: h.memory, isLoading: { value: false }, remember: h.remember, hide: h.hide, forgetAll: h.forgetAll, replaceWith: h.replaceWith,
  }),
}));
vi.mock("@/composables/encounters/usePartySight", async () => {
  const { ref: r } = await import("vue");
  return {
    usePartySight: (opts: { grid: unknown }) => {
      h.sightGrid = opts.grid;
      return { viewers: r([]), sight: r(new Set<string>()) };
    },
  };
});
vi.mock("@/composables/locations/useRememberSight", () => ({ useRememberSight: vi.fn() }));
vi.mock("@/composables/locations/useLocationState", () => ({
  useLocationStateForRooms: () => ({
    isSuccess: h.statesLoaded,
    stateOf: (id: string) => (h.explored.has(id) ? { value: true } : undefined),
  }),
  useAssertLocationState: () => ({ mutate: h.assert }),
}));

vi.mock("@/composables/encounters/useEncounterRoom", () => ({
  useEncounterRoom: () => ({
    encounter: ref({ id: "e1", location_id: "l1", factions: [] }),
    location: ref({ id: "l1", location_type: "region" }),
    mapLocation: ref({ id: "l1" }),
    surface: h.surface,
    focusRoom: ref(null),
    terrainZones: h.zones,
    regions: h.regions,
  }),
}));
vi.mock("@/composables/encounters/useEncounterLive", () => ({
  useEncounterLive: (...args: unknown[]) => {
    h.liveArgs = args;
    return {
    isLive: h.isLive,
    liveStateLoaded: ref(true),
    scheduleMapPush: h.scheduleMapPush,
    moveToken: h.moveToken,
    };
  },
  liveState: h.liveState,
}));
vi.mock("@/composables/monsters/useMonstersByIds", () => ({ useMonstersByIds: () => ({ data: ref(new Map()) }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: vi.fn(), fromError: vi.fn() }) }));

import { usePlayMapState } from "./usePlayMapState";
import { useEncounterRunStore } from "@/stores/encounterRun";
import { useCampaignStore } from "@/stores/campaign";
import type { Campaign, ExploreParty } from "@/types/campaign.types";

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
    h.regions.value = [];
    h.memory.value = new Set();
    h.explored = new Set();
    h.statesLoaded.value = true;
    useCampaignStore().activeCampaign = { id: "c1", explore_party: null } as Campaign;
    h.surface.value = {
      focusRoomId: null, focusCells: [], mapLocation: { id: "l1", is_battle_map: true },
      calibration: { cells_per_image_width: 10, origin_x_pct: 0, origin_y_pct: 0 },
      live: { doors: [door] },
    };
  });

  // The same component is reused from /encounters/A/run to /encounters/B/run: live state bound to A's id would push B's
  // doors and tokens into A's fight.
  it("binds the live state to the encounter id as it changes, not to the id at setup", () => {
    const id = ref("e1");
    usePlayMapState(id, "dm");
    const bound = h.liveArgs[0] as { value?: string } | (() => string);
    const read = () => (typeof bound === "function" ? bound() : bound.value);
    expect(read()).toBe("e1");
    id.value = "e2";
    expect(read()).toBe("e2");
  });

  // A box calibration of 29.9999 made the column count fractional, so sight indexed row 0 only and the fog never lifted.
  it("hands sight a whole number of columns for a fractional calibration", () => {
    h.surface.value = { ...(h.surface.value as object), calibration: { cells_per_image_width: 29.9999, origin_x_pct: 0, origin_y_pct: 0 } };
    usePlayMapState(ref("e1"), "dm", { w: 1000, h: 1000 });
    expect((h.sightGrid as { value: unknown }).value).toEqual({ cols: 30, rows: 30 });
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
    expect(h.scheduleMapPush).not.toHaveBeenCalled();
  });

  it("a second click inside a darkness sphere removes it instead of stacking another", () => {
    const s = setup();
    s.toggleDarknessAt(5, 5, 15);
    expect(s.darknessZones.value).toHaveLength(1);
    s.toggleDarknessAt(5.2, 5.1, 15);
    expect(s.darknessZones.value).toHaveLength(0);
  });

  // Fog is the map's memory: a stroke writes through it, live or not, and never into the fight's row.
  it("the Reveal brush remembers only squares not yet remembered, and Hide forgets only remembered ones", () => {
    h.memory.value = new Set(["2,1"]);
    const s = setup();
    s.paintFog(new Set(["1,1", "2,1"]), "reveal");
    expect(h.remember).toHaveBeenCalledWith(["1,1"]);
    s.paintFog(new Set(["2,1", "9,9"]), "hide");
    expect(h.hide).toHaveBeenCalledWith(["2,1"]);
    expect(h.scheduleMapPush).not.toHaveBeenCalled();
  });

  it("Reveal all replaces the memory with the picture's cells, and Hide all forgets it", () => {
    const s = setup();
    s.revealAll(100, 50);
    const cells = (h.replaceWith.mock.calls[0] as unknown as [Set<string>])[0];
    expect(cells.size).toBe(50);
    expect(cells.has("9,4")).toBe(true);
    s.hideAll();
    expect(h.forgetAll).toHaveBeenCalledTimes(1);
  });

  // A follower window shows the table, it does not edit it.
  it("a follower window never writes the map's memory", () => {
    const s = setup("follower");
    s.paintFog(new Set(["1,1"]), "reveal");
    s.paintFog(new Set(["1,1"]), "hide");
    s.revealAll(100, 50);
    s.hideAll();
    expect(h.remember).not.toHaveBeenCalled();
    expect(h.hide).not.toHaveBeenCalled();
    expect(h.replaceWith).not.toHaveBeenCalled();
    expect(h.forgetAll).not.toHaveBeenCalled();
  });

  // Seeding the focus room's cells open used to put a fight's start into the map's memory.
  it("going live in a room reveals nothing: the focus room is not seeded into the memory", () => {
    h.isLive.value = true;
    h.liveState.value = { combatants_live: [combatant("a")], current_round: 0, active_combatant_index: 0 };
    h.surface.value = { ...(h.surface.value as object), focusRoomId: "r1", focusCells: ["0,0", "1,0"] };
    setup();
    expect(h.remember).not.toHaveBeenCalled();
    expect(h.replaceWith).not.toHaveBeenCalled();
  });

  describe("entering a room marks it Explored", () => {
    function pc(id: string, at: { x: number; y: number }): RunCombatant {
      return { ...combatant(id, at), type: "player" };
    }
    function region(room: string, cells: [number, number][]) {
      return { region_role: "space", space_location_id: room, cells: cells.map(([x, y]) => `${x},${y}`) };
    }
    function inRooms(tokens: RunCombatant[]) {
      h.regions.value = [region("room-a", [[0, 0], [1, 0]]), region("room-b", [[5, 5]])];
      h.isLive.value = true;
      h.liveState.value = { combatants_live: tokens, current_round: 1, active_combatant_index: 0 };
      return setup();
    }

    it("asserts explored once for a room a character stands in, with the fight as its note", () => {
      const s = inRooms([pc("p1", { x: 0, y: 0 }), pc("p2", { x: 1, y: 0 })]);
      expect(h.assert).toHaveBeenCalledTimes(1);
      expect(h.assert).toHaveBeenCalledWith({ location_id: "room-a", fact: "explored", value: true, note: "entered in a fight" });
      s.moveCombatant("p1", { x: 0, y: 0 });
    });

    it("leaves a room already explored, and a monster's room, alone", () => {
      h.explored = new Set(["room-a"]);
      inRooms([pc("p1", { x: 0, y: 0 }), { ...combatant("m1", { x: 5, y: 5 }), type: "monster" }]);
      expect(h.assert).not.toHaveBeenCalled();
    });

    it("waits until the explored facts have loaded rather than re-asserting what it cannot see", () => {
      h.statesLoaded.value = false;
      inRooms([pc("p1", { x: 0, y: 0 })]);
      expect(h.assert).not.toHaveBeenCalled();
    });

    it("a follower window asserts nothing", () => {
      h.regions.value = [region("room-a", [[0, 0]])];
      h.isLive.value = true;
      h.liveState.value = { combatants_live: [pc("p1", { x: 0, y: 0 })], current_round: 1, active_combatant_index: 0 };
      setup("follower");
      expect(h.assert).not.toHaveBeenCalled();
    });
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
    h.liveState.value = { combatants_live: [combatant("a", { x: 4, y: 4 })], current_round: 1, active_combatant_index: 0 };
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
  // #1125 decision 9: a fight started while exploring the site stands everyone where they were.
  describe("a fight started from exploring", () => {
    function hero(memberId: string): RunCombatant {
      return { ...combatant(`p-${memberId}`), type: "player", party_member_id: memberId };
    }
    function fightFrom(explore: ExploreParty | null) {
      useCampaignStore().activeCampaign = { id: "c1", explore_party: explore } as Campaign;
      h.isLive.value = true;
      h.liveState.value = { combatants_live: [hero("pm1"), hero("pm2")], current_round: 0, active_combatant_index: 0 };
      h.surface.value = {
        ...(h.surface.value as object),
        focusRoomId: "r1", focusCells: ["0,0", "1,0", "2,0"],
      };
      setup();
    }

    it("seats a character on the square they stood on, and seats the rest by the room", () => {
      fightFrom({ site_id: "l1", positions: { pm1: { x: 6, y: 4 } } });
      expect(h.moveToken).toHaveBeenCalledWith("p-pm1", { x: 6, y: 4 });
      expect(h.moveToken).toHaveBeenCalledWith("p-pm2", { x: 0, y: 0 });
    });

    it("ignores squares walked on another site", () => {
      fightFrom({ site_id: "another-site", positions: { pm1: { x: 6, y: 4 } } });
      expect(h.moveToken).toHaveBeenCalledWith("p-pm1", { x: 0, y: 0 });
    });

    it("does not seat a character past the right edge of the picture", () => {
      fightFrom({ site_id: "l1", positions: { pm1: { x: 10, y: 4 } } });
      expect(h.moveToken).not.toHaveBeenCalledWith("p-pm1", { x: 10, y: 4 });
    });
  });
});
