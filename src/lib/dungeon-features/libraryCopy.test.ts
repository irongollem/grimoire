import { describe, expect, it } from "vitest";
import {
  libraryFeatureToInsert,
  libraryPuzzleToInsert,
  libraryRollTableToInsert,
  libraryTrapToInsert,
} from "./libraryCopy";
import type { LibraryTrap } from "@/types/trap.types";
import type { LibraryDungeonFeature } from "@/types/dungeonFeature.types";
import type { LibraryPuzzle } from "@/types/puzzle.types";
import type { LibraryRollTable } from "@/types/rollTable.types";

const trap: LibraryTrap = {
  id: "grimoire_hidden_pit",
  source: "grimoire-dungeon-craft",
  name: "Hidden Pit",
  description: "A covered pit.",
  trap_type: "Mechanical",
  hazard_glyph: "pit",
  cr: "1/2",
  trigger_type: "Pressure Plate",
  detection_dc: 12,
  disarm_dc: null,
  effect_description: "Fall 10 feet.",
  save_type: "DEX",
  save_dc: 12,
  attack_bonus: null,
  damage_entries: [{ dice: "1d6", type: "bludgeoning" }],
  reset_type: "Manual",
  trap_hp: null,
  trap_ac: null,
  damage_immunities: [],
  image_url: "https://cdn.example/srd/pit.webp",
  image_focal_point: { x: 0.4, y: 0.6 },
  tags: ["pit"],
  notes: "Run it early.",
  created_at: "2026-10-14T00:00:00Z",
  updated_at: "2026-10-14T00:00:00Z",
};

const feature: LibraryDungeonFeature = {
  id: "grimoire_secret_door",
  source: "grimoire-dungeon-craft",
  name: "Secret Door",
  feature_type: "Secret Door",
  description: null,
  perception_dc: 15,
  investigation_dc: null,
  arcana_dc: null,
  trigger_type: "Lever",
  trigger_description: null,
  feature_glyph: "secret_door",
  object_material: null,
  object_size: null,
  object_ac: null,
  object_hp: null,
  damage_threshold: null,
  break_dc: null,
  lock_dc: null,
  contents_description: null,
  image_url: null,
  image_focal_point: null,
  tags: [],
  notes: null,
  created_at: "2026-10-14T00:00:00Z",
  updated_at: "2026-10-14T00:00:00Z",
};

describe("libraryTrapToInsert", () => {
  it("keeps the name, content and art, and scopes to the campaign", () => {
    const insert = libraryTrapToInsert(trap, "camp-1");
    expect(insert.name).toBe("Hidden Pit");
    expect(insert.image_url).toBe(trap.image_url);
    expect(insert.image_focal_point).toEqual({ x: 0.4, y: 0.6 });
    expect(insert.damage_entries).toEqual(trap.damage_entries);
    expect(insert.notes).toBe("Run it early.");
    expect(insert.campaign_id).toBe("camp-1");
  });

  it("drops library-only and server-owned columns", () => {
    const insert = libraryTrapToInsert(trap, null);
    for (const key of ["id", "source", "created_at", "updated_at"]) expect(insert).not.toHaveProperty(key);
    expect(insert.campaign_id).toBeNull();
  });
});

describe("libraryFeatureToInsert", () => {
  it("keeps the content and scopes to the campaign", () => {
    const insert = libraryFeatureToInsert(feature, "camp-2");
    expect(insert.name).toBe("Secret Door");
    expect(insert.perception_dc).toBe(15);
    expect(insert.feature_glyph).toBe("secret_door");
    expect(insert.campaign_id).toBe("camp-2");
    for (const key of ["id", "source", "created_at", "updated_at"]) expect(insert).not.toHaveProperty(key);
  });
});

const puzzle: LibraryPuzzle = {
  id: "grimoire_riddle",
  source: "grimoire-dungeon-craft",
  name: "Riddle Door",
  puzzle_type: "Logic",
  difficulty: "Easy",
  description: "A door with a riddle.",
  read_aloud: "The door speaks.",
  solution: "Echo",
  hints: [{ order: 1, text: "Listen." }],
  skill_checks: [{ skill: "Insight", dc: 12 }],
  success_outcome: "It opens.",
  failure_consequence: "It shrieks.",
  tags: ["door"],
  notes: "Note.",
  image_url: "https://cdn.example/srd/riddle.webp",
  image_focal_point: { x: 0.5, y: 0.5 },
  created_at: "",
  updated_at: "",
};

describe("libraryPuzzleToInsert", () => {
  it("copies content and art, scoped to the campaign, with sharing state reset", () => {
    const insert = libraryPuzzleToInsert(puzzle, "camp-1");
    expect(insert.name).toBe("Riddle Door");
    expect(insert.read_aloud).toBe("The door speaks.");
    expect(insert.hints).toEqual(puzzle.hints);
    expect(insert.image_url).toBe(puzzle.image_url);
    expect(insert.image_focal_point).toEqual({ x: 0.5, y: 0.5 });
    expect(insert.campaign_id).toBe("camp-1");
    expect(insert.is_shared).toBe(false);
    expect(insert.shared_hints).toEqual([]);
    expect(insert.player_visible_to).toEqual([]);
    expect(insert.location_id).toBeNull();
    expect(insert.dungeon_feature_id).toBeNull();
    expect(insert.library_dungeon_feature_id).toBeNull();
  });

  it("drops library-only and server-owned columns", () => {
    const insert = libraryPuzzleToInsert(puzzle, "camp-1");
    for (const key of ["id", "source", "created_at", "updated_at"]) expect(insert).not.toHaveProperty(key);
  });
});

const rollTable: LibraryRollTable = {
  id: "grimoire_forest",
  source: "grimoire-dungeon-craft",
  name: "Forest Road",
  description: "Daytime.",
  dice: "1d6",
  entries: [
    { min: 1, max: 3, label: "Wolves", notes: null },
    { min: 4, max: 6, label: "Quiet", notes: "Nothing." },
  ],
  tags: ["forest"],
  notes: null,
  created_at: "",
  updated_at: "",
};

describe("libraryRollTableToInsert", () => {
  it("mints entry ids, leaves encounters unlinked and scopes to the campaign", () => {
    const insert = libraryRollTableToInsert(rollTable, "camp-3");
    expect(insert.campaign_id).toBe("camp-3");
    expect(insert.dice).toBe("1d6");
    expect(insert.entries.map((e) => [e.min, e.max, e.label, e.notes, e.encounter_id])).toEqual([
      [1, 3, "Wolves", null, null],
      [4, 6, "Quiet", "Nothing.", null],
    ]);
    const ids = insert.entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f-]{36}$/);
    for (const key of ["id", "source", "created_at", "updated_at"]) expect(insert).not.toHaveProperty(key);
  });
});
