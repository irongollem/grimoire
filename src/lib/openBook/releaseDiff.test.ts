import { describe, expect, it } from "vitest";
import type { OpenBookSnapshot } from "@/types/openBook.types";
import { diffIsEmpty, diffSnapshots, groupBySection } from "./releaseDiff";

function snapshot(parts: { places?: { id: string; name: string; description?: string }[]; lore?: { id: string; title: string }[] }): OpenBookSnapshot {
  return {
    v: 1,
    book: {
      title: "T",
      subtitle: null,
      cover_art: "tooled",
      cover_image_url: null,
      leather: "oxblood",
      chapters: [],
      campaign_name: "C",
    },
    calendar: { calendar_id: null, custom_calendar: null, current: { year: null, month: null, day: null } },
    places: (parts.places ?? []) as unknown as OpenBookSnapshot["places"],
    folk: [],
    factions: [],
    pantheons: [],
    deities: [],
    lore: (parts.lore ?? []) as unknown as OpenBookSnapshot["lore"],
    sessions: [],
    events: [],
    names: {},
  };
}

describe("diffSnapshots", () => {
  it("treats everything as new when nothing is live", () => {
    const diff = diffSnapshots(snapshot({ places: [{ id: "a", name: "Hollowmere" }] }), null);
    expect(diff.added.map((i) => i.name)).toEqual(["Hollowmere"]);
    expect(diff.revised).toEqual([]);
    expect(diff.removed).toEqual([]);
  });

  it("finds new, revised and taken-out entries by id", () => {
    const live = snapshot({
      places: [
        { id: "a", name: "Hollowmere", description: "old" },
        { id: "b", name: "Toll Stair" },
      ],
      lore: [{ id: "l1", title: "The Drowned Choir" }],
    });
    const preview = snapshot({
      places: [
        { id: "a", name: "Hollowmere", description: "new" },
        { id: "c", name: "Saltgate" },
      ],
      lore: [],
    });
    const diff = diffSnapshots(preview, live);
    expect(diff.added).toEqual([{ section: "places", id: "c", name: "Saltgate" }]);
    expect(diff.revised).toEqual([{ section: "places", id: "a", name: "Hollowmere" }]);
    expect(diff.removed).toEqual([
      { section: "places", id: "b", name: "Toll Stair" },
      { section: "lore", id: "l1", name: "The Drowned Choir" },
    ]);
  });

  it("reports no change for identical books", () => {
    const s = snapshot({ places: [{ id: "a", name: "Hollowmere" }] });
    expect(diffIsEmpty(diffSnapshots(s, s))).toBe(true);
  });

  it("is not empty when the only change is a revision", () => {
    const live = snapshot({ places: [{ id: "a", name: "Hollowmere", description: "old" }] });
    const preview = snapshot({ places: [{ id: "a", name: "Hollowmere", description: "new" }] });
    expect(diffIsEmpty(diffSnapshots(preview, live))).toBe(false);
  });
});

describe("groupBySection", () => {
  it("groups names by section in reading order", () => {
    const groups = groupBySection([
      { section: "lore", id: "1", name: "Legend" },
      { section: "places", id: "2", name: "A" },
      { section: "places", id: "3", name: "B" },
    ]);
    expect(groups).toEqual([
      { section: "places", label: "Places", names: ["A", "B"] },
      { section: "lore", label: "Lore", names: ["Legend"] },
    ]);
  });
});
