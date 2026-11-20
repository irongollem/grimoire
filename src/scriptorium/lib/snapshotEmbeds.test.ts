import { describe, expect, it } from "vitest";
import { snapshotEmbedLookup } from "./snapshotEmbeds";
import type { OpenBookSnapshot } from "@/types/openBook.types";

const snapshot = {
  places: [{ id: "p1", name: "Saltmere", location_type: "city", player_summary: "A port.", description: null, image_url: null }],
  folk: [{ id: "n1", name: "Cover Name", race: "Human", occupation: "Smith", portrait_url: null }],
  factions: [{ id: "fa1", name: "Guild", faction_type: null, description: null }],
  deities: [{ id: "d1", name: "Nerith", titles: null, description: null }],
  truths: [{ id: "t1", title: "The sea is dying" }],
  lore: [{ id: "l1", title: "The Fall", lore_kind: "history", world_date: { year: 12, month: null, day: null }, body: null, passages: [{ id: "x", title: "Told", body: null }] }],
} as unknown as OpenBookSnapshot;

describe("snapshotEmbedLookup", () => {
  it("resolves what the whole party may read, from the snapshot alone", () => {
    const lookup = snapshotEmbedLookup(snapshot, [
      { type: "location", id: "p1" }, { type: "npc", id: "n1" }, { type: "faction", id: "fa1" },
      { type: "deity", id: "d1" }, { type: "canon", id: "t1" }, { type: "canon", id: "l1" },
    ]);
    expect(lookup["location:p1"]).toContain("Saltmere");
    expect(lookup["npc:n1"]).toContain("Cover Name");
    expect(lookup["faction:fa1"]).toContain("Guild");
    expect(lookup["deity:d1"]).toContain("Nerith");
    expect(lookup["canon:t1"]).toContain("The sea is dying");
    expect(lookup["canon:l1"]).toContain("Year 12");
    expect(lookup["canon:l1"]).toContain("Told");
  });

  it("holds nothing for an entry the snapshot lacks, and for kinds it never carries (a DM-only secret, a monster, a quest)", () => {
    const lookup = snapshotEmbedLookup(snapshot, [
      { type: "canon", id: "a-secret" }, { type: "monster", id: "m1" }, { type: "quest", id: "q1" }, { type: "npc", id: "unlisted" },
    ]);
    expect(Object.values(lookup).filter((v) => v !== undefined)).toEqual([]);
  });

  it("holds nothing at all when the campaign has no Open Book to say what the party may read", () => {
    expect(snapshotEmbedLookup(null, [{ type: "canon", id: "t1" }])).toEqual({});
  });
});
