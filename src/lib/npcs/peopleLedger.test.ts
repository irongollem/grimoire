import { describe, expect, it } from "vitest";
import {
  earliestRevealPerNpc,
  withRevealMoments,
  buildPeopleGroups,
  classifyPeople,
  NEW_TO_YOU_SINCE,
  statusWord,
  type PeopleGroupContext,
} from "./peopleLedger";
import type { PlayerNpc } from "@/types/npc.types";

interface Spec {
  id: string;
  name?: string | null;
  revealed_at?: string | null;
  unmasked_at?: string | null;
  place?: { id: string; name: string; within?: string | null };
  rating?: number;
}

const AFTER = "2026-10-07T10:00:00Z";

function make(specs: Spec[]) {
  const npcs = specs.map(
    (s) =>
      ({
        id: s.id,
        name: s.name === undefined ? s.id.toUpperCase() : s.name,
        disguise_name: null,
        disguise_portrait_url: null,
        is_revealed: false,
        revealed_at: s.revealed_at ?? null,
        unmasked_at: s.unmasked_at ?? null,
      }) as PlayerNpc,
  );
  const byId = new Map(specs.map((s) => [s.id, s]));
  const ctx: PeopleGroupContext = {
    getRating: (id) => byId.get(id)?.rating ?? 0,
    place: (npc) => {
      const p = byId.get(npc.id)?.place;
      return p ? { id: p.id, name: p.name, within: p.within ?? null } : null;
    },
    now: new Date(2026, 9, 6, 12),
  };
  return { npcs, ctx };
}
const ids = (l: PlayerNpc[]) => l.map((n) => n.id);

describe("classifyPeople", () => {
  it("puts an unopened reveal after launch face down, and out of the ledger", () => {
    const { npcs } = make([{ id: "a", revealed_at: AFTER }]);
    const r = classifyPeople(npcs, new Map());
    expect(ids(r.faceDown)).toEqual(["a"]);
    expect(r.ledger).toEqual([]);
  });

  it("never turns a reveal at or before the launch instant face down", () => {
    const { npcs } = make([
      { id: "at", revealed_at: NEW_TO_YOU_SINCE.toISOString() },
      { id: "before", revealed_at: "2026-10-05T23:59:59Z" },
    ]);
    const r = classifyPeople(npcs, new Map());
    expect(r.faceDown).toEqual([]);
    expect(ids(r.ledger)).toEqual(["at", "before"]);
  });

  it("an opened NPC lands in the ledger", () => {
    const { npcs } = make([{ id: "a", revealed_at: AFTER }]);
    const r = classifyPeople(npcs, new Map([["a", new Date(AFTER)]]));
    expect(ids(r.ledger)).toEqual(["a"]);
  });

  it("an NPC with no revealed_at is ledger", () => {
    const { npcs } = make([{ id: "a" }]);
    expect(ids(classifyPeople(npcs, new Map()).ledger)).toEqual(["a"]);
  });

  it("unmasked: met before the unmask and not opened since", () => {
    const { npcs } = make([
      { id: "a", revealed_at: "2026-09-01T00:00:00Z", unmasked_at: "2026-10-07T00:00:00Z" },
    ]);
    expect(ids(classifyPeople(npcs, new Map()).unmasked)).toEqual(["a"]);
    // opened before the unmask: still unmasked
    expect(
      ids(classifyPeople(npcs, new Map([["a", new Date("2026-09-15T00:00:00Z")]])).unmasked),
    ).toEqual(["a"]);
  });

  it("read exactly at unmasked_at counts as seen", () => {
    const { npcs } = make([
      { id: "a", revealed_at: "2026-09-01T00:00:00Z", unmasked_at: "2026-10-07T00:00:00Z" },
    ]);
    const r = classifyPeople(npcs, new Map([["a", new Date("2026-10-07T00:00:00Z")]]));
    expect(r.unmasked).toEqual([]);
    expect(ids(r.ledger)).toEqual(["a"]);
  });

  it("unmasked beats face down", () => {
    const { npcs } = make([
      { id: "a", revealed_at: "2026-10-06T08:00:00Z", unmasked_at: "2026-10-07T00:00:00Z" },
    ]);
    const r = classifyPeople(npcs, new Map());
    expect(ids(r.unmasked)).toEqual(["a"]);
    expect(r.faceDown).toEqual([]);
  });

  it("not unmasked for someone who first met them after the unmask", () => {
    const { npcs } = make([
      { id: "a", revealed_at: "2026-10-08T00:00:00Z", unmasked_at: "2026-10-07T00:00:00Z" },
    ]);
    const r = classifyPeople(npcs, new Map());
    expect(r.unmasked).toEqual([]);
    expect(ids(r.faceDown)).toEqual(["a"]);
  });

  it("not unmasked without a known reveal", () => {
    const { npcs } = make([{ id: "a", unmasked_at: "2026-10-07T00:00:00Z" }]);
    expect(ids(classifyPeople(npcs, new Map()).ledger)).toEqual(["a"]);
  });

  it("keeps input order and handles empty input", () => {
    const { npcs } = make([
      { id: "c", revealed_at: AFTER },
      { id: "a", revealed_at: AFTER },
      { id: "b", revealed_at: AFTER },
    ]);
    expect(ids(classifyPeople(npcs, new Map()).faceDown)).toEqual(["c", "a", "b"]);
    expect(classifyPeople([], new Map())).toEqual({ faceDown: [], unmasked: [], ledger: [] });
  });
});

describe("statusWord", () => {
  it("says nothing for alive and names the rest", () => {
    expect(statusWord("alive")).toBeNull();
    expect(statusWord("dead")).toBe("Dead");
    expect(statusWord("missing")).toBe("Missing");
    expect(statusWord("unknown")).toBe("Unknown");
  });
});

describe("buildPeopleGroups", () => {
  it("returns no groups for no people", () => {
    const { ctx } = make([]);
    for (const f of ["rating", "revealed", "location", "name"] as const) {
      expect(buildPeopleGroups([], f, "asc", ctx)).toEqual([]);
    }
  });

  it("rating and name give one untitled group", () => {
    const { npcs, ctx } = make([
      { id: "a", name: "Aria", rating: 1 },
      { id: "b", name: "Brom", rating: 5 },
      { id: "c", name: null, rating: 3 },
    ]);
    const byRating = buildPeopleGroups(npcs, "rating", "desc", ctx);
    expect(byRating).toHaveLength(1);
    expect(byRating[0]?.title).toBeNull();
    expect(ids(byRating[0]!.people)).toEqual(["b", "c", "a"]);
    const byName = buildPeopleGroups(npcs, "name", "asc", ctx);
    expect(byName).toHaveLength(1);
    expect(ids(byName[0]!.people)).toEqual(["a", "b", "c"]);
  });

  it("location groups by place name, unknown last, rating then name inside", () => {
    const { npcs, ctx } = make([
      { id: "a", name: "Aria", place: { id: "p2", name: "Zephyr Keep", within: "Northmarch" } },
      { id: "b", name: "Brom", place: { id: "p1", name: "Ashford" }, rating: 1 },
      { id: "c", name: "Cade", place: { id: "p1", name: "Ashford" }, rating: 4 },
      { id: "d", name: "Dara" },
    ]);
    const groups = buildPeopleGroups(npcs, "location", "asc", ctx);
    expect(groups.map((g) => g.title)).toEqual(["Ashford", "Zephyr Keep", "Whereabouts unknown"]);
    expect(ids(groups[0]!.people)).toEqual(["c", "b"]);
    expect(groups[1]?.within).toBe("Northmarch");
    expect(groups[0]?.within).toBeNull();
    const desc = buildPeopleGroups(npcs, "location", "desc", ctx);
    expect(desc.map((g) => g.title)).toEqual(["Zephyr Keep", "Ashford", "Whereabouts unknown"]);
  });

  it("location has no unknown group when every NPC has a place", () => {
    const { npcs, ctx } = make([{ id: "a", place: { id: "p", name: "Ashford" } }]);
    expect(buildPeopleGroups(npcs, "location", "asc", ctx)).toHaveLength(1);
  });

  it("revealed groups by local day, newest day first on desc, newest first inside", () => {
    const { npcs, ctx } = make([
      { id: "a", revealed_at: new Date(2026, 9, 4, 9).toISOString() },
      { id: "b", revealed_at: new Date(2026, 9, 4, 21).toISOString() },
      { id: "c", revealed_at: new Date(2026, 9, 5, 10).toISOString() },
      { id: "d" },
    ]);
    const desc = buildPeopleGroups(npcs, "revealed", "desc", ctx);
    expect(desc.map((g) => g.title)).toEqual(["5 October", "4 October", "Before the ledger"]);
    expect(ids(desc[1]!.people)).toEqual(["b", "a"]);
    const asc = buildPeopleGroups(npcs, "revealed", "asc", ctx);
    expect(asc.map((g) => g.title)).toEqual(["4 October", "5 October", "Before the ledger"]);
  });

  it("adds the year to a day title outside now's year", () => {
    const { npcs, ctx } = make([
      { id: "a", revealed_at: new Date(2025, 11, 31, 12).toISOString() },
      { id: "b", revealed_at: new Date(2026, 0, 1, 12).toISOString() },
    ]);
    const groups = buildPeopleGroups(npcs, "revealed", "desc", ctx);
    expect(groups.map((g) => g.title)).toEqual(["1 January", "31 December 2025"]);
  });
});

describe("earliestRevealPerNpc", () => {
  it("keeps the earliest moment per NPC regardless of row order", () => {
    const map = earliestRevealPerNpc([
      { npc_id: "a", revealed_at: "2026-10-05T10:00:00Z" },
      { npc_id: "a", revealed_at: "2026-10-04T10:00:00Z" },
      { npc_id: "b", revealed_at: "2026-10-06T10:00:00Z" },
    ]);
    expect(map.get("a")).toBe("2026-10-04T10:00:00Z");
    expect(map.get("b")).toBe("2026-10-06T10:00:00Z");
  });
});

describe("withRevealMoments", () => {
  it("sets revealed_at from the moments, null when the viewer has none", () => {
    const { npcs } = make([{ id: "a" }, { id: "b" }]);
    const out = withRevealMoments(npcs, new Map([["a", "2026-10-04T10:00:00Z"]]));
    expect(out.map((n) => n.revealed_at)).toEqual(["2026-10-04T10:00:00Z", null]);
  });
});
