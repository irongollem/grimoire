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

  // Names the column tables the registry's own consumers (the note editor and the
  // privacy guard) treat as "stored in a column"; an entity_note type must never leak in.
  it("lists exactly the column-stored entities' tables as column tables", () => {
    const expected = types.flatMap((t) => {
      const store = DM_NOTE_ENTITIES[t].store;
      return store.kind === "column" ? [store.table] : [];
    });
    expect([...DM_NOTE_COLUMN_TABLES].sort()).toEqual(expected.sort());
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

  // companion and roll_table open a list the note lives in, so they cannot carry the id.
  const IDLESS = new Set<DmNoteEntityType>(["companion", "roll_table"]);

  it.each(types.filter((t) => !IDLESS.has(t)))("sends a %s note to a route that names the entity", (type) => {
    const target = dmNoteEntry(type).route("abc-123");
    expect(JSON.stringify(target)).toContain("abc-123");
  });

  it("sends a location note through the place route", () => {
    expect(dmNoteEntry("location").route("a")).toBe("/locations?at=a");
  });
});
