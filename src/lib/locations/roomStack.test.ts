import { describe, it, expect } from "vitest";
import { buildRoomStack } from "./roomStack";
import type { HiddenDoorRow, RoomStackInput } from "./roomStack";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";
import type { LocationPlacementWithEntity } from "@/composables/locations/useLocationPlacements";
import type { Trap } from "@/types/trap.types";
import type { DungeonFeature } from "@/types/dungeonFeature.types";
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
    name: "The Ash-Screen",
    feature_type: "Secret Door",
    description: null,
    perception_dc: 16,
    investigation_dc: null,
    arcana_dc: null,
    trigger_type: null,
    trigger_description: null,
    feature_glyph: "secret_door",
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
    combatants: [combatant("c1")],
    factions: [],
    item_ids: [],
    trap_ids: [],
    reward_currency_pools: [],
    art_objects: [],
    location_id: null,
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
    kind: "item",
    item_id: null,
    quantity: 1,
    label: "Tithe-box remnants",
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

function door(over: Partial<HiddenDoorRow> = {}): HiddenDoorRow {
  return {
    id: "door-1",
    from_location_id: "room-1",
    to_location_id: "room-2",
    is_one_way: false,
    sort_order: null,
    from_location: { id: "room-1", name: "Nave of Ash" },
    to_location: { id: "room-2", name: "Abbot's Cell" },
    label: "behind the ash-screen",
    is_secret: true,
    dungeon_feature_id: "feature-1",
    ...over,
  };
}

function baseInput(over: Partial<RoomStackInput> = {}): RoomStackInput {
  return {
    roomId: "room-1",
    placements: [],
    traps: [],
    features: [],
    encounters: [],
    zones: [],
    roomRegion: region(),
    doors: [],
    doorFound: () => false,
    loot: [],
    ...over,
  };
}

describe("buildRoomStack", () => {
  it("orders rows traps, encounters, hidden things, roll tables, loot", () => {
    const rows = buildRoomStack(
      baseInput({
        placements: [
          placement({ id: "p-trap", trap_id: "trap-1" }),
          placement({ id: "p-roll", roll_table_id: "roll-1", roll_table: { id: "roll-1", name: "Undercroft debris" } }),
        ],
        traps: [trap()],
        encounters: [encounter({ location_id: "room-1" })],
        doors: [door()],
        loot: [loot()],
      }),
    );
    expect(rows.map((r) => r.kind)).toEqual(["trap", "encounter", "hidden", "roll_table", "loot"]);
  });

  it("builds a trap row with a passive-notice + note subtitle and a trigger action linking to the trap's page", () => {
    const rows = buildRoomStack(
      baseInput({
        placements: [placement({ id: "p-trap", trap_id: "trap-1", note: "third pew" })],
        traps: [trap({ detection_dc: 15 })],
      }),
    );
    expect(rows).toEqual([
      { id: "trap:p-trap", kind: "trap", label: "Ash-choke plate", subtitle: "Passive 15 notices it · third pew", action: "trigger", target: "/traps/trap-1" },
    ]);
  });

  it("names the placement's own cell in the trap subtitle when source_cell_key is set", () => {
    const rows = buildRoomStack(
      baseInput({
        placements: [placement({ id: "p-trap", trap_id: "trap-1", note: "third pew", source_cell_key: "7,2" })],
        traps: [trap({ detection_dc: 15 })],
      }),
    );
    expect(rows[0]?.subtitle).toBe("Passive 15 notices it · cell 7,2 · third pew");
  });

  it("drops a placement whose trap id isn't in the catalogue rather than rendering a broken row", () => {
    const rows = buildRoomStack(baseInput({ placements: [placement({ trap_id: "missing" })], traps: [] }));
    expect(rows).toEqual([]);
  });

  it("lists a directly-placed encounter with a combatant-count subtitle and a run action", () => {
    const rows = buildRoomStack(baseInput({ encounters: [encounter({ location_id: "room-1", combatants: [combatant("c1"), combatant("c2")] })] }));
    expect(rows).toEqual([
      { id: "encounter:encounter-1", kind: "encounter", label: "Ash-wights (×4)", subtitle: "2 combatants", action: "run", target: "/encounters/encounter-1/run" },
    ]);
  });

  it("surfaces a trigger-zone encounter whose zone intersects the room's own cells", () => {
    const zone = region({
      id: "zone-1",
      region_role: "zone",
      zone_kind: "trigger",
      zone_payload: { encounter_id: "encounter-1" },
      space_location_id: null,
      label: "the altar",
      cells: ["7,2"],
    });
    const rows = buildRoomStack(
      baseInput({
        zones: [zone],
        encounters: [encounter({ location_id: null })],
        roomRegion: region({ cells: ["7,2"] }),
      }),
    );
    expect(rows).toEqual([
      {
        id: "encounter-zone:zone-1",
        kind: "encounter",
        label: "Ash-wights (×4)",
        subtitle: "Trigger zone on the altar — prompt, never automatic",
        action: "run",
        target: "/encounters/encounter-1/run",
      },
    ]);
  });

  it("never lists the same encounter twice when it is both placed here and named by a trigger zone", () => {
    const zone = region({ id: "zone-1", region_role: "zone", zone_kind: "trigger", zone_payload: { encounter_id: "encounter-1" }, space_location_id: null, cells: ["7,2"] });
    const rows = buildRoomStack(
      baseInput({
        zones: [zone],
        encounters: [encounter({ location_id: "room-1" })],
        roomRegion: region({ cells: ["7,2"] }),
      }),
    );
    expect(rows.filter((r) => r.kind === "encounter")).toHaveLength(1);
  });

  it("does not surface a trigger zone whose cells don't intersect this room's own region", () => {
    const zone = region({ id: "zone-1", region_role: "zone", zone_kind: "trigger", zone_payload: { encounter_id: "encounter-1" }, space_location_id: null, cells: ["9,9"] });
    const rows = buildRoomStack(baseInput({ zones: [zone], encounters: [encounter()], roomRegion: region({ cells: ["7,2"] }) }));
    expect(rows).toEqual([]);
  });

  it("builds a hidden row for an undiscovered secret door, naming its governing feature and DC", () => {
    const rows = buildRoomStack(baseInput({ doors: [door()], features: [feature({ perception_dc: 16 })] }));
    expect(rows).toEqual([
      { id: "hidden:door-1", kind: "hidden", label: "The Ash-Screen", subtitle: "Undiscovered · Perception DC 16", action: "reveal", target: "door-1" },
    ]);
  });

  it("prefers Perception over Investigation when a feature has both DCs — matches the trap rows' passive-DC convention", () => {
    const rows = buildRoomStack(baseInput({ doors: [door()], features: [feature({ perception_dc: 16, investigation_dc: 14 })] }));
    expect(rows[0]?.subtitle).toBe("Undiscovered · Perception DC 16");
  });

  it("falls back to Investigation DC when the feature has no Perception DC", () => {
    const rows = buildRoomStack(baseInput({ doors: [door()], features: [feature({ perception_dc: null, investigation_dc: 14 })] }));
    expect(rows[0]?.subtitle).toBe("Undiscovered · Investigation DC 14");
  });

  it("drops a secret door once its `found` fact is asserted — it is an ordinary way out now", () => {
    const rows = buildRoomStack(baseInput({ doors: [door()], features: [feature()], doorFound: (id) => id === "door-1" }));
    expect(rows).toEqual([]);
  });

  it("never lists an ordinary (non-secret) door as a hidden thing", () => {
    const rows = buildRoomStack(baseInput({ doors: [door({ is_secret: false })] }));
    expect(rows).toEqual([]);
  });

  it("falls back to the door's own label when it has no governing feature", () => {
    const rows = buildRoomStack(baseInput({ doors: [door({ dungeon_feature_id: null, label: "a gap in the wall" })] }));
    expect(rows[0]).toMatchObject({ label: "a gap in the wall", subtitle: "Undiscovered" });
  });

  it("builds a roll-table row from the placement's own note, falling back to a generic prompt", () => {
    const withNote = buildRoomStack(baseInput({ placements: [placement({ roll_table_id: "roll-1", roll_table: { id: "roll-1", name: "Undercroft debris" }, note: "d20, what's in the drifts" })] }));
    expect(withNote).toEqual([
      { id: "roll:placement-1", kind: "roll_table", label: "Undercroft debris", subtitle: "d20, what's in the drifts", action: "roll", target: "roll-1" },
    ]);
    const withoutNote = buildRoomStack(baseInput({ placements: [placement({ roll_table_id: "roll-1", roll_table: { id: "roll-1", name: "Undercroft debris" } })] }));
    expect(withoutNote[0]?.subtitle).toBe("Roll for what's here");
  });

  it("lists only held loot — a dispatched entry has already told its own story in chat", () => {
    const rows = buildRoomStack(baseInput({ loot: [loot({ delivery_state: "held" }), loot({ id: "loot-2", delivery_state: "chat" })] }));
    expect(rows).toEqual([
      { id: "loot:loot-1", kind: "loot", label: "Tithe-box remnants", subtitle: "Held until you drop it", action: "drop", target: "loot-1" },
    ]);
  });

  it("multiplies a loot row's label by quantity when more than one", () => {
    const rows = buildRoomStack(baseInput({ loot: [loot({ quantity: 3, label: "Silver candlestick" })] }));
    expect(rows[0]?.label).toBe("3× Silver candlestick");
  });

  it("ignores placements, encounters, doors and loot belonging to a different room", () => {
    const rows = buildRoomStack(
      baseInput({
        placements: [placement({ location_id: "other-room", trap_id: "trap-1" })],
        traps: [trap()],
        encounters: [encounter({ location_id: "other-room" })],
        loot: [loot({ location_id: "other-room" })],
      }),
    );
    expect(rows).toEqual([]);
  });
});
