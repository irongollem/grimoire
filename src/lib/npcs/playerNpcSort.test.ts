import { describe, expect, it } from "vitest";
import { defaultSortDir, effectivePeopleSort, PLAYER_NPC_SORT_FIELDS, sortPlayerNpcs } from "./playerNpcSort";
import type { PlayerNpc } from "@/types/npc.types";

interface Spec {
  id: string;
  name: string | null;
  revealed_at?: string | null;
  loc?: string;
  rating?: number;
}

function make(specs: Spec[]) {
  const npcs = specs.map(
    (s) =>
      ({
        id: s.id,
        name: s.name,
        disguise_name: null,
        disguise_portrait_url: null,
        is_revealed: true,
        revealed_at: s.revealed_at ?? null,
      }) as PlayerNpc,
  );
  const byId = new Map(specs.map((s) => [s.id, s]));
  const ctx = {
    getRating: (id: string) => byId.get(id)?.rating ?? 0,
    locationName: (npc: PlayerNpc) => byId.get(npc.id)?.loc ?? "",
  };
  return { npcs, ctx };
}

const ids = (list: PlayerNpc[]) => list.map((n) => n.id);

describe("sortPlayerNpcs", () => {
  it("rating desc puts higher stars first, unrated last, ties by name", () => {
    const { npcs, ctx } = make([
      { id: "a", name: "Aria", rating: 0 },
      { id: "b", name: "Brom", rating: 5 },
      { id: "c", name: "Cade", rating: 3 },
      { id: "d", name: "Dara", rating: 5 },
    ]);
    expect(ids(sortPlayerNpcs(npcs, "rating", "desc", ctx))).toEqual(["b", "d", "c", "a"]);
  });

  it("rating asc reverses stars but keeps the name tiebreak ascending", () => {
    const { npcs, ctx } = make([
      { id: "a", name: "Aria", rating: 0 },
      { id: "b", name: "Brom", rating: 5 },
      { id: "c", name: "Cade", rating: 0 },
    ]);
    expect(ids(sortPlayerNpcs(npcs, "rating", "asc", ctx))).toEqual(["a", "c", "b"]);
  });

  it("revealed desc is newest first, asc oldest first, unknown always last", () => {
    const { npcs, ctx } = make([
      { id: "a", name: "Aria", revealed_at: "2026-01-01T00:00:00Z" },
      { id: "b", name: "Brom", revealed_at: null },
      { id: "c", name: "Cade", revealed_at: "2026-03-01T00:00:00Z" },
    ]);
    expect(ids(sortPlayerNpcs(npcs, "revealed", "desc", ctx))).toEqual(["c", "a", "b"]);
    expect(ids(sortPlayerNpcs(npcs, "revealed", "asc", ctx))).toEqual(["a", "c", "b"]);
  });

  it("revealed ties fall back to name", () => {
    const t = "2026-01-01T00:00:00Z";
    const { npcs, ctx } = make([
      { id: "z", name: "Zed", revealed_at: t },
      { id: "a", name: "Aria", revealed_at: t },
    ]);
    expect(ids(sortPlayerNpcs(npcs, "revealed", "desc", ctx))).toEqual(["a", "z"]);
  });

  it("location sorts by name in both directions, no location always last", () => {
    const { npcs, ctx } = make([
      { id: "a", name: "Aria" },
      { id: "b", name: "Brom", loc: "Waterdeep" },
      { id: "c", name: "Cade", loc: "Baldur's Gate" },
    ]);
    expect(ids(sortPlayerNpcs(npcs, "location", "asc", ctx))).toEqual(["c", "b", "a"]);
    expect(ids(sortPlayerNpcs(npcs, "location", "desc", ctx))).toEqual(["b", "c", "a"]);
  });

  it("within a location keeps rating desc then name", () => {
    const { npcs, ctx } = make([
      { id: "a", name: "Aria", loc: "Town", rating: 1 },
      { id: "b", name: "Brom", loc: "Town", rating: 4 },
      { id: "c", name: "Cade", loc: "Town", rating: 1 },
    ]);
    expect(ids(sortPlayerNpcs(npcs, "location", "asc", ctx))).toEqual(["b", "a", "c"]);
    expect(ids(sortPlayerNpcs(npcs, "location", "desc", ctx))).toEqual(["b", "a", "c"]);
  });

  it("name sorts both ways with nameless NPCs always last", () => {
    const { npcs, ctx } = make([
      { id: "x", name: null },
      { id: "b", name: "Brom" },
      { id: "a", name: "Aria" },
    ]);
    expect(ids(sortPlayerNpcs(npcs, "name", "asc", ctx))).toEqual(["a", "b", "x"]);
    expect(ids(sortPlayerNpcs(npcs, "name", "desc", ctx))).toEqual(["b", "a", "x"]);
  });

  it("nameless NPCs are last for the other fields too on ties", () => {
    const { npcs, ctx } = make([
      { id: "x", name: null, rating: 2 },
      { id: "a", name: "Aria", rating: 2 },
    ]);
    expect(ids(sortPlayerNpcs(npcs, "rating", "desc", ctx))).toEqual(["a", "x"]);
  });

  it("does not mutate the input", () => {
    const { npcs, ctx } = make([
      { id: "b", name: "Brom" },
      { id: "a", name: "Aria" },
    ]);
    sortPlayerNpcs(npcs, "name", "asc", ctx);
    expect(ids(npcs)).toEqual(["b", "a"]);
  });
});

describe("defaultSortDir", () => {
  it("picks the natural direction for every field", () => {
    expect(PLAYER_NPC_SORT_FIELDS.map((f) => [f, defaultSortDir(f)])).toEqual([
      ["rating", "desc"],
      ["revealed", "desc"],
      ["location", "asc"],
      ["name", "asc"],
    ]);
  });
});

describe("effectivePeopleSort", () => {
  it("keeps the stored field and direction while it can be applied", () => {
    expect(effectivePeopleSort("location", "asc", true)).toEqual({ field: "location", dir: "asc" });
    expect(effectivePeopleSort("rating", "asc", false)).toEqual({ field: "rating", dir: "asc" });
  });

  it("falls back from Place to rating with rating's own direction", () => {
    // The stored "asc" was Place's A to Z; carried over it would put the
    // unrated and lowest-rated NPCs first under a control reading "Your rating".
    expect(effectivePeopleSort("location", "asc", false)).toEqual({ field: "rating", dir: "desc" });
  });
});
