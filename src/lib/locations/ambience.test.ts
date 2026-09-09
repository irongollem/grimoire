import { describe, it, expect } from "vitest";
import { resolveInheritedTheme, type AmbienceLocationLike } from "@/lib/locations/ambience";

function place(over: Partial<AmbienceLocationLike> & { id: string }): AmbienceLocationLike {
  return { parent_id: null, audio_theme: null, name: over.id, ...over };
}

function index(...locations: AmbienceLocationLike[]): ReadonlyMap<string, AmbienceLocationLike> {
  return new Map(locations.map((loc) => [loc.id, loc]));
}

describe("resolveInheritedTheme", () => {
  it("resolves a location's own theme without looking at its parent", () => {
    const byId = index(
      place({ id: "site", audio_theme: "dungeon-wet" }),
      place({ id: "room", parent_id: "site", audio_theme: "shrine-choral" }),
    );
    expect(resolveInheritedTheme("room", byId)).toEqual({
      theme: "shrine-choral",
      from: byId.get("room"),
      kind: "own",
    });
  });

  it("inherits from the nearest themed ancestor, two levels up", () => {
    const byId = index(
      place({ id: "continent", audio_theme: "dungeon-wet" }),
      place({ id: "site", parent_id: "continent", audio_theme: null }),
      place({ id: "room", parent_id: "site", audio_theme: null }),
    );
    expect(resolveInheritedTheme("room", byId)).toEqual({
      theme: "dungeon-wet",
      from: byId.get("continent"),
      kind: "inherited",
    });
  });

  it("treats the room's own silence as the answer, not a chain to keep walking", () => {
    const byId = index(
      place({ id: "site", audio_theme: "dungeon-wet" }),
      place({ id: "room", parent_id: "site", audio_theme: "silence" }),
    );
    expect(resolveInheritedTheme("room", byId)).toEqual({
      theme: null,
      from: byId.get("room"),
      kind: "silence",
    });
  });

  it("carries an ancestor's silence down to an inheriting room as 'silence-inherited', distinct from own silence", () => {
    const byId = index(
      place({ id: "site", audio_theme: "silence" }),
      place({ id: "room", parent_id: "site", audio_theme: null }),
    );
    expect(resolveInheritedTheme("room", byId)).toEqual({
      theme: null,
      from: byId.get("site"),
      kind: "silence-inherited",
    });
  });

  it("keeps a site's own declared silence as 'silence', not 'silence-inherited'", () => {
    const byId = index(place({ id: "site", audio_theme: "silence" }));
    expect(resolveInheritedTheme("site", byId)).toEqual({
      theme: null,
      from: byId.get("site"),
      kind: "silence",
    });
  });

  it("does not let a site's silence override a room with its own theme", () => {
    const byId = index(
      place({ id: "site", audio_theme: "silence" }),
      place({ id: "reliquary", parent_id: "site", audio_theme: "shrine-choral" }),
    );
    expect(resolveInheritedTheme("reliquary", byId)).toEqual({
      theme: "shrine-choral",
      from: byId.get("reliquary"),
      kind: "own",
    });
  });

  it("resolves to none when no location in the chain has ever been themed", () => {
    const byId = index(
      place({ id: "continent" }),
      place({ id: "site", parent_id: "continent" }),
      place({ id: "room", parent_id: "site" }),
    );
    expect(resolveInheritedTheme("room", byId)).toEqual({ theme: null, from: null, kind: "none" });
  });

  it("resolves to none for an id absent from the index", () => {
    expect(resolveInheritedTheme("ghost", index())).toEqual({ theme: null, from: null, kind: "none" });
  });

  it("survives a parent_id cycle instead of looping forever", () => {
    const byId = index(
      place({ id: "a", parent_id: "b" }),
      place({ id: "b", parent_id: "a" }),
    );
    expect(resolveInheritedTheme("a", byId)).toEqual({ theme: null, from: null, kind: "none" });
  });
});
