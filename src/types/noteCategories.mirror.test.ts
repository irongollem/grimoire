import { describe, it, expect } from "vitest";
import { NOTE_CATEGORIES } from "@edge-shared/campaignSearch";
import type { NoteCategory } from "./notes.types";

/**
 * search-campaign passes every note category to match_campaign_notes (its
 * `p_categories` is fail-closed). The edge function cannot import the client
 * type, so it restates the list; this holds the two equal in both directions.
 */
type Missing = Exclude<NoteCategory, (typeof NOTE_CATEGORIES)[number]>;
type Extra = Exclude<(typeof NOTE_CATEGORIES)[number], NoteCategory>;
const noMissing: [Missing] extends [never] ? true : false = true;
const noExtra: [Extra] extends [never] ? true : false = true;

describe("NOTE_CATEGORIES mirrors NoteCategory", () => {
  it("has no category the client type lacks, and lacks none it has", () => {
    expect(noMissing && noExtra).toBe(true);
    expect(new Set(NOTE_CATEGORIES).size).toBe(NOTE_CATEGORIES.length);
  });
});
