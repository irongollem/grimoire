import { describe, expect, it } from "vitest";
import {
  DM_NOTE_COLUMN_TABLES,
  DM_NOTE_ENTITIES,
  dmNoteEntry,
  type DmNoteEntityType,
} from "./registry";

const types = Object.keys(DM_NOTE_ENTITIES) as DmNoteEntityType[];

describe("dm note registry", () => {
  it("keys every entry by its own type", () => {
    for (const type of types) expect(dmNoteEntry(type).type).toBe(type);
  });

  it("never stores a note for a player-readable entity in a column (privacy invariant)", () => {
    for (const type of ["deity", "species", "companion", "hero", "spell"] as const) {
      expect(DM_NOTE_ENTITIES[type].store.kind, type).toBe("entity_note");
    }
  });

  it("maps the column types to their tables", () => {
    const columns = types.filter((t) => DM_NOTE_ENTITIES[t].store.kind === "column");
    expect(columns.sort()).toEqual(
      ["dungeon_feature", "item", "location", "loot_table", "monster", "npc", "puzzle", "roll_table", "trap"],
    );
    expect(DM_NOTE_ENTITIES.item.store).toMatchObject({ table: "items", column: "dm_notes" });
    expect(DM_NOTE_COLUMN_TABLES.has("puzzle_rooms")).toBe(true);
    expect(DM_NOTE_COLUMN_TABLES.has("deities")).toBe(false);
  });

  it("names the table holding each note-kind entity's campaign, and none for an app-wide hero", () => {
    for (const type of types) {
      const store = DM_NOTE_ENTITIES[type].store;
      if (store.kind !== "entity_note") continue;
      if (type === "hero") expect(store.campaignTable, type).toBeNull();
      else expect(store.campaignTable, type).toEqual(expect.any(String));
    }
    expect(DM_NOTE_ENTITIES.party_member.store).toEqual({ kind: "entity_note", campaignTable: "party_members" });
  });

  it("builds routes", () => {
    expect(dmNoteEntry("npc").route("a")).toBe("/npcs/a");
    expect(dmNoteEntry("item").route("a")).toBe("/vault/a");
    expect(dmNoteEntry("party_member").route("a")).toBe("/party/a");
    expect(dmNoteEntry("companion").route("a")).toBe("/party");
    expect(dmNoteEntry("roll_table").route("a")).toEqual({ path: "/dungeon-craft", query: { tab: "roll-tables" } });
    expect(dmNoteEntry("location").route("a")).toBe("/locations?at=a");
  });
});
