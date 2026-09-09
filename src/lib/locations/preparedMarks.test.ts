import { describe, it, expect } from "vitest";
import { MARK_COLOURS, resolvePreparedMarks } from "./preparedMarks";
import type { PreparedMarksInput } from "./preparedMarks";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";
import type { LocationPlacementWithEntity } from "@/composables/locations/useLocationPlacements";
import type { Trap } from "@/types/trap.types";
import type { DungeonFeature } from "@/types/dungeonFeature.types";
import type { PuzzleRoom } from "@/types/puzzle.types";
import type { CombatantDef, Encounter } from "@/types/encounter.types";
import type { LootPlacement } from "@/types/quest.types";

function region(over: Partial<LocationMapRegion> = {}): LocationMapRegion {
  return {
    id: "region-1",
    user_id: "u",
    site_location_id: "site-1",
    space_location_id: "room-1",
    cells: ["7,2"],
    label: null,
    sort_order: null,
    region_role: "space",
    zone_kind: null,
    zone_payload: {},
    derived_from: "dm",
    cell_signature: null,
    vertices: null,
    created_at: "",
    updated_at: "",
    ...over,
  };
}

function placement(over: Partial<LocationPlacementWithEntity> = {}): LocationPlacementWithEntity {
  return {
    id: "placement-1",
    user_id: "u",
    location_id: "room-1",
    trap_id: null,
    dungeon_feature_id: null,
    roll_table_id: null,
    loot_table_id: null,
    note: null,
    sort_order: null,
    source_cell_key: null,
    created_at: "",
    updated_at: "",
    trap: null,
    dungeon_feature: null,
    roll_table: null,
    loot_table: null,
    ...over,
  };
}

function trap(over: Partial<Trap> = {}): Trap {
  return {
    id: "trap-1",
    user_id: "u",
    campaign_id: null,
    name: "Ash-choke plate",
    description: null,
    trap_type: "Mechanical",
    hazard_glyph: "pressure_plate",
    cr: null,
    trigger_type: "Pressure Plate",
    detection_dc: 15,
    disarm_dc: null,
    effect_description: null,
    save_type: null,
    save_dc: null,
    attack_bonus: null,
    damage_entries: [],
    reset_type: "None",
    trap_hp: null,
    trap_ac: null,
    damage_immunities: [],
    image_url: null,
    image_focal_point: null,
    tags: [],
    notes: null,
    created_at: "",
    updated_at: "",
    ...over,
  };
}

function feature(over: Partial<DungeonFeature> = {}): DungeonFeature {
  return {
    id: "feature-1",
    user_id: "u",
    campaign_id: null,
    name: "The Tithe Altar",
    feature_type: "Other",
    description: null,
    perception_dc: null,
    investigation_dc: 13,
    arcana_dc: null,
    trigger_type: null,
    trigger_description: null,
    feature_glyph: "altar",
    contents_description: null,
    image_url: null,
    image_focal_point: null,
    tags: [],
    notes: null,
    created_at: "",
    updated_at: "",
    ...over,
  };
}

function puzzle(over: Partial<PuzzleRoom> = {}): PuzzleRoom {
  return {
    id: "puzzle-1",
    user_id: "u",
    name: "The Tithe Riddle",
    puzzle_type: "Arcane",
    difficulty: "Medium",
    description: null,
    solution: null,
    hints: [],
    skill_checks: [],
    success_outcome: null,
    failure_consequence: null,
    image_url: null,
    image_focal_point: null,
    tags: [],
    notes: null,
    campaign_id: null,
    is_shared: false,
    player_visible_to: [],
    shared_hints: [],
    read_aloud: null,
    location_id: null,
    dungeon_feature_id: null,
    created_at: "",
    updated_at: "",
    ...over,
  };
}

function combatant(id: string): CombatantDef {
  return { id, monster_id: "monster-1", npc_id: null, count: 1, faction_id: "hostile", custom_name: null };
}

function encounter(over: Partial<Encounter> = {}): Encounter {
  return {
    id: "encounter-1",
    user_id: "u",
    campaign_id: null,
    name: "Ash-wights (×4)",
    description: null,
    party_member_ids: [],
    companion_ids: [],
    party_member_factions: {},
    combatants: [combatant("c1"), combatant("c2")],
    factions: [],
    item_ids: [],
    trap_ids: [],
    reward_currency_pools: [],
    art_objects: [],
    location_id: "room-1",
    is_finished: false,
    lair_enabled: false,
    lair_owner_def_id: null,
    audio_theme: null,
    created_at: "",
    updated_at: "",
    ...over,
  };
}

function loot(over: Partial<LootPlacement> = {}): LootPlacement {
  return {
    id: "loot-1",
    beat_id: null,
    quest_id: null,
    location_id: "room-1",
    campaign_id: "campaign-1",
    kind: "loot_chest",
    item_id: null,
    quantity: 1,
    label: "Undercroft chest",
    payload: {},
    source_type: "prepared",
    source_id: null,
    sort_order: 0,
    dispatch_message_id: null,
    dispatched_at: null,
    delivery_state: "held",
    quantity_remaining: 1,
    claimed_by_names: [],
    handed_out_this_session: false,
    ...over,
  };
}

function baseInput(over: Partial<PreparedMarksInput> = {}): PreparedMarksInput {
  return {
    placements: [],
    traps: [],
    features: [],
    puzzles: [],
    encounters: [],
    lootPlacements: [],
    regions: [region()],
    ...over,
  };
}

describe("resolvePreparedMarks", () => {
  it("draws a trap at its own cell when source_cell_key wins on position", () => {
    const marks = resolvePreparedMarks(
      baseInput({
        placements: [placement({ trap_id: "trap-1", source_cell_key: "7,2" })],
        traps: [trap()],
      }),
    );
    expect(marks).toHaveLength(1);
    expect(marks[0]).toMatchObject({ kind: "trap", cell: "7,2", colour: MARK_COLOURS.trap });
  });

  it("falls back to the room's centroid when a trap has no cell of its own", () => {
    const marks = resolvePreparedMarks(
      baseInput({
        placements: [placement({ trap_id: "trap-1", source_cell_key: null, location_id: "room-1" })],
        traps: [trap()],
        regions: [region({ cells: ["4,4", "5,4", "4,5"] })],
      }),
    );
    expect(marks).toHaveLength(1);
    // centroid of this L-tromino's cell centres averages to (4.83, 4.83) -> nearest cell (4,4)
    expect(marks[0].cell).toBe("4,4");
  });

  it("drops a placement with no cell and no bound region", () => {
    const marks = resolvePreparedMarks(
      baseInput({
        placements: [placement({ trap_id: "trap-1", source_cell_key: null, location_id: "unbound-room" })],
        traps: [trap()],
      }),
    );
    expect(marks).toHaveLength(0);
  });

  it("colours a connection-type feature as a secret feature, never plain feature", () => {
    const marks = resolvePreparedMarks(
      baseInput({
        placements: [placement({ id: "p2", dungeon_feature_id: "feature-1", source_cell_key: "1,1" })],
        features: [feature({ feature_type: "Secret Door" })],
      }),
    );
    expect(marks[0].kind).toBe("secret_feature");
    expect(marks[0].colour).toBe(MARK_COLOURS.secret_feature);
  });

  it("colours an ordinary feature type as a plain feature", () => {
    const marks = resolvePreparedMarks(
      baseInput({
        placements: [placement({ id: "p2", dungeon_feature_id: "feature-1", source_cell_key: "1,1" })],
        features: [feature({ feature_type: "Treasure Chest" })],
      }),
    );
    expect(marks[0].kind).toBe("feature");
    expect(marks[0].colour).toBe(MARK_COLOURS.feature);
  });

  it("leads a feature's subtitle with Perception DC when both DCs are set, matching roomStack's featureDcPhrase", () => {
    const marks = resolvePreparedMarks(
      baseInput({
        placements: [placement({ id: "p2", dungeon_feature_id: "feature-1", source_cell_key: "1,1" })],
        features: [feature({ perception_dc: 16, investigation_dc: 13 })],
      }),
    );
    expect(marks[0].subtitle).toBe("Altar · Perception DC 16");
  });

  it("falls back to Investigation DC when Perception is unset", () => {
    const marks = resolvePreparedMarks(
      baseInput({
        placements: [placement({ id: "p2", dungeon_feature_id: "feature-1", source_cell_key: "1,1" })],
        features: [feature({ perception_dc: null, investigation_dc: 13 })],
      }),
    );
    expect(marks[0].subtitle).toBe("Altar · Investigation DC 13");
  });

  it("never draws a marker for a roll-table or loot-table placement", () => {
    const marks = resolvePreparedMarks(
      baseInput({
        placements: [
          placement({ id: "p-roll", roll_table_id: "rt-1", source_cell_key: "1,1" }),
          placement({ id: "p-loot", loot_table_id: "lt-1", source_cell_key: "1,1" }),
        ],
      }),
    );
    expect(marks).toHaveLength(0);
  });

  it("draws a puzzle hosted by a feature at that feature's own cell", () => {
    const marks = resolvePreparedMarks(
      baseInput({
        placements: [placement({ id: "p2", dungeon_feature_id: "feature-1", source_cell_key: "9,9" })],
        features: [feature()],
        puzzles: [puzzle({ dungeon_feature_id: "feature-1" })],
      }),
    );
    const puzzleMark = marks.find((m) => m.kind === "puzzle");
    expect(puzzleMark?.cell).toBe("9,9");
  });

  it("draws a puzzle anchored to a room at that room's centroid", () => {
    const marks = resolvePreparedMarks(
      baseInput({
        puzzles: [puzzle({ location_id: "room-1" })],
      }),
    );
    expect(marks).toHaveLength(1);
    expect(marks[0].cell).toBe("7,2");
  });

  it("drops a puzzle anchored to neither a feature nor a room", () => {
    const marks = resolvePreparedMarks(baseInput({ puzzles: [puzzle()] }));
    expect(marks).toHaveLength(0);
  });

  it("draws an encounter at its room's centroid", () => {
    const marks = resolvePreparedMarks(baseInput({ encounters: [encounter()] }));
    expect(marks).toHaveLength(1);
    expect(marks[0]).toMatchObject({ kind: "encounter", cell: "7,2" });
  });

  it("draws a loot placement at its room's centroid", () => {
    const marks = resolvePreparedMarks(baseInput({ lootPlacements: [loot()] }));
    expect(marks).toHaveLength(1);
    expect(marks[0]).toMatchObject({ kind: "loot", cell: "7,2" });
  });

  it("draws a hazard zone's linked trap at the zone's own centroid, not any room's", () => {
    const marks = resolvePreparedMarks(
      baseInput({
        traps: [trap()],
        regions: [
          region({ id: "room-region", cells: ["0,0"] }),
          region({
            id: "zone-1",
            region_role: "zone",
            zone_kind: "hazard",
            zone_payload: { trap_id: "trap-1" },
            space_location_id: null,
            cells: ["9,9"],
          }),
        ],
      }),
    );
    expect(marks).toHaveLength(1);
    expect(marks[0]).toMatchObject({ id: "zone-trap:zone-1", kind: "trap", cell: "9,9", spaceId: null, colour: MARK_COLOURS.trap });
  });

  it("skips a hazard zone with no linked trap, and a non-hazard zone entirely", () => {
    const marks = resolvePreparedMarks(
      baseInput({
        traps: [trap()],
        regions: [
          region({ id: "hazard-no-trap", region_role: "zone", zone_kind: "hazard", zone_payload: {}, space_location_id: null }),
          region({ id: "terrain-with-trap", region_role: "zone", zone_kind: "terrain", zone_payload: { trap_id: "trap-1" }, space_location_id: null }),
        ],
      }),
    );
    expect(marks).toHaveLength(0);
  });

  it("fans out a second mark sharing a cell with the first", () => {
    const marks = resolvePreparedMarks(
      baseInput({
        placements: [placement({ id: "p2", dungeon_feature_id: "feature-1", source_cell_key: "7,2" })],
        features: [feature()],
        encounters: [encounter({ location_id: "room-1" })],
      }),
    );
    expect(marks).toHaveLength(2);
    const offsets = marks.map((m) => m.fanOffset).sort((a, b) => a - b);
    expect(offsets).toEqual([0, 0.3]);
  });
});
