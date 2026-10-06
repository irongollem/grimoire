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
import type { PlayerSessionLabel } from "@/types/session.types";

interface Spec {
  id: string;
  name?: string | null;
  revealed_at?: string | null;
  session?: string | null;
  unmasked_at?: string | null;
  place?: { id: string; name: string; within?: string | null };
  rating?: number;
}

const AFTER = "2026-10-07T10:00:00Z";

function session(id: string, number: number | null, title: string | null, day: string): PlayerSessionLabel {
  return { id, number, title, played_on: day, started_at: null, ended_at: null };
}
const SESSIONS = new Map(
  [
    session("s14", 14, "The Southern Road", "2026-10-04"),
    session("s14b", 14, null, "2026-10-11"),
    session("s15", 15, "Into the Mere", "2026-10-18"),
    session("sx", null, null, "2026-09-20"),
    session("sy", null, "A Side Quest", "2026-09-27"),
  ].map((s) => [s.id, s]),
);

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
        revealed_session_id: s.session ?? null,
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
    sessionOf: (id) => SESSIONS.get(id) ?? null,
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

  it("revealed groups by session, newest session first on desc, newest reveal first inside", () => {
    const { npcs, ctx } = make([
      { id: "a", session: "s14", revealed_at: "2026-10-04T09:00:00Z" },
      { id: "b", session: "s14", revealed_at: "2026-10-04T21:00:00Z" },
      { id: "c", session: "s15", revealed_at: "2026-10-18T10:00:00Z" },
      { id: "d" },
      { id: "e", session: "gone", revealed_at: "2026-01-01T10:00:00Z" },
    ]);
    const desc = buildPeopleGroups(npcs, "revealed", "desc", ctx);
    expect(desc.map((g) => g.title)).toEqual(["Session 15", "Session 14", "Before the log"]);
    expect(desc.map((g) => g.within)).toEqual(["Into the Mere", "The Southern Road", null]);
    expect(desc.map((g) => g.end)).toEqual(["18 Oct", "4 Oct", undefined]);
    expect(ids(desc[1]!.people)).toEqual(["b", "a"]);
    expect(ids(desc[2]!.people)).toEqual(["d", "e"]);
    const asc = buildPeopleGroups(npcs, "revealed", "asc", ctx);
    expect(asc.map((g) => g.title)).toEqual(["Session 14", "Session 15", "Before the log"]);
  });

  it("keeps two sessions with the same number as separate groups", () => {
    const { npcs, ctx } = make([
      { id: "a", session: "s14", revealed_at: "2026-10-04T09:00:00Z" },
      { id: "b", session: "s14b", revealed_at: "2026-10-11T09:00:00Z" },
    ]);
    const groups = buildPeopleGroups(npcs, "revealed", "desc", ctx);
    expect(groups.map((g) => g.key)).toEqual(["session:s14b", "session:s14"]);
    expect(groups.map((g) => g.title)).toEqual(["Session 14", "Session 14"]);
    expect(groups.map((g) => g.within)).toEqual([null, "The Southern Road"]);
  });

  it("names an unnumbered session by its title, else 'Unnumbered session'", () => {
    const { npcs, ctx } = make([
      { id: "a", session: "sx", revealed_at: "2026-09-20T09:00:00Z" },
      { id: "b", session: "sy", revealed_at: "2026-09-27T09:00:00Z" },
    ]);
    const groups = buildPeopleGroups(npcs, "revealed", "desc", ctx);
    expect(groups.map((g) => g.title)).toEqual(["A Side Quest", "Unnumbered session"]);
    expect(groups.every((g) => g.within === null)).toBe(true);
  });
});

describe("earliestRevealPerNpc", () => {
  it("keeps the earliest moment, and its session, per NPC regardless of row order", () => {
    const map = earliestRevealPerNpc([
      { npc_id: "a", revealed_at: "2026-10-05T10:00:00Z", session_id: "s2" },
      { npc_id: "a", revealed_at: "2026-10-04T10:00:00Z", session_id: "s1" },
      { npc_id: "b", revealed_at: "2026-10-06T10:00:00Z", session_id: null },
    ]);
    expect(map.get("a")).toEqual({ revealed_at: "2026-10-04T10:00:00Z", session_id: "s1" });
    expect(map.get("b")).toEqual({ revealed_at: "2026-10-06T10:00:00Z", session_id: null });
  });
});

describe("withRevealMoments", () => {
  it("sets the moment and its session, null when the viewer has none", () => {
    const { npcs } = make([{ id: "a" }, { id: "b" }]);
    const out = withRevealMoments(
      npcs,
      new Map([["a", { revealed_at: "2026-10-04T10:00:00Z", session_id: "s14" }]]),
    );
    expect(out.map((n) => n.revealed_at)).toEqual(["2026-10-04T10:00:00Z", null]);
    expect(out.map((n) => n.revealed_session_id)).toEqual(["s14", null]);
  });
});
