import { describe, expect, it } from "vitest";
import { buildBookModel } from "@/lib/openBook/bookModel";
import { readTies } from "@/lib/openBook/connections";
import type { OpenBookSnapshot } from "@/types/openBook.types";

const place = (id: string, name: string) => ({ id, parent_id: null, name, location_type: null, player_summary: null, description: null, image_url: null, tags: null, is_level: null, is_battle_map: null, npcs_shared: null, map: null, pins: [] });
const person = (id: string, name: string) => ({ id, name, race: null, occupation: null, status: null, relationship: null, portrait_url: null, portrait_focal_point: null, cutout_url: null, location_id: null, former_name: null, former_portrait_url: null });

function snapshot(ties?: unknown): OpenBookSnapshot {
  const base: OpenBookSnapshot = {
    v: 1,
    book: { title: "T", subtitle: null, cover_art: "tooled", cover_image_url: null, leather: "oxblood", chapters: ["atlas", "folk", "factions", "pantheon"], campaign_name: "C" },
    calendar: { calendar_id: null, custom_calendar: null, current: { year: null, month: null, day: null } },
    places: [place("crossing", "Thane's Crossing")],
    folk: [person("brenna", "Brenna Ashe"), person("ama", "Sister Ama"), person("ghost", "Ghost")],
    factions: [{ id: "thane", name: "House Thane", faction_type: null, description: null, emblem_url: null, alignment: null, tags: null, party_standing: null, descent: null }],
    pantheons: [],
    deities: [{ id: "lady", pantheon_id: null, name: "The Drowned Lady", titles: null, alternate_names: null, alignment: null, symbol: null, symbol_image_url: null, portrait_url: null, portrait_focal_point: null, domains: null, portfolio: null, description: null, tags: null }],
    lore: [],
    sessions: [],
    events: [],
    names: {},
  };
  return ties === undefined ? base : ({ ...base, ties } as OpenBookSnapshot);
}

const ties = [
  { source: "link", type: "worships", from_kind: "npc", from_id: "brenna", to_kind: "deity", to_id: "lady", told: "Leaves her the first fish." },
  { source: "membership", type: "member_of", from_kind: "npc", from_id: "brenna", to_kind: "faction", to_id: "thane", told: null },
  { source: "npc_home", type: "lives_in", from_kind: "npc", from_id: "brenna", to_kind: "location", to_id: "crossing", told: null },
  { source: "kin", type: "parent_of", from_kind: "npc", from_id: "ama", to_kind: "npc", to_id: "brenna", told: null },
];

describe("connections of a book entry", () => {
  it("reads an entry's ties from its own side, grouped as on the sheet", () => {
    const model = buildBookModel(snapshot(ties));
    const groups = model.connectionsOf("brenna");
    expect(groups.map((g) => g.group)).toEqual(["people", "factions", "places", "deities"]);
    expect(groups[0]!.lines[0]).toMatchObject({ word: "child of", told: null });
    expect(groups[0]!.lines[0]!.entry.id).toBe("ama");
    expect(groups[3]!.lines[0]).toMatchObject({ word: "worships", told: "Leaves her the first fish." });
    expect(groups[2]!.lines[0]!.word).toBe("lives in");
  });

  it("reads the same tie in the other direction from the far page", () => {
    const model = buildBookModel(snapshot(ties));
    expect(model.connectionsOf("lady")[0]!.lines[0]!.word).toBe("worshipped by");
    expect(model.connectionsOf("thane")[0]!.lines[0]!.word).toBe("includes");
    expect(model.connectionsOf("ama")[0]!.lines[0]!.word).toBe("parent of");
  });

  it("drops a tie whose far end is not a page of the book", () => {
    const model = buildBookModel(snapshot([{ ...ties[0], to_id: "elsewhere" }]));
    expect(model.connectionsOf("brenna")).toEqual([]);
  });

  it("drops a tie whose far entry is a different kind of page than the tie says", () => {
    // "thane" is a faction page, the tie claims it is a person.
    const model = buildBookModel(snapshot([{ ...ties[0], to_kind: "npc", to_id: "thane" }]));
    expect(model.connectionsOf("brenna")).toEqual([]);
    expect(model.connectionsOf("thane")).toEqual([]);
  });

  it("lists a tie told twice (by a link and by a membership) once", () => {
    const model = buildBookModel(snapshot([ties[1], { ...ties[1], source: "link" }]));
    expect(model.connectionsOf("brenna")[0]!.lines).toHaveLength(1);
  });

  it("orders lines by their word, then by the far page's title", () => {
    const tie = (from_id: string) => ({ source: "membership", type: "member_of", from_kind: "npc", from_id, to_kind: "faction", to_id: "thane", told: null });
    const model = buildBookModel(snapshot([tie("ama"), tie("brenna")]));
    expect(model.connectionsOf("thane")[0]!.lines.map((l) => l.entry.id)).toEqual(["brenna", "ama"]);
  });

  it("trims what a tie tells and reads a blank telling as none", () => {
    const model = buildBookModel(snapshot([{ ...ties[0], told: "  Leaves her fish.  " }, { ...ties[1], told: "   " }]));
    const lines = model.connectionsOf("brenna").flatMap((g) => g.lines);
    expect(lines.map((l) => l.told).sort()).toEqual(["Leaves her fish.", null]);
  });

  it("treats a release without ties as having none", () => {
    expect(buildBookModel(snapshot()).connectionsOf("brenna")).toEqual([]);
    expect(readTies(snapshot())).toEqual([]);
  });

  it("drops malformed ties and a non-array key without failing", () => {
    expect(readTies(snapshot("nope"))).toEqual([]);
    const bad = [
      null, 4, { type: "worships" }, { ...ties[0], from_kind: "item" }, { ...ties[0], to_id: "brenna" },
      { ...ties[0], type: "" }, { ...ties[0], source: 7 }, ties[0],
    ];
    expect(readTies(snapshot(bad))).toHaveLength(1);
  });
});
