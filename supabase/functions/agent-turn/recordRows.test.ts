import { describe, expect, it } from "vitest";
import { RECORD_SECTION_MAX } from "../_shared/agent/record.ts";
import { candidateFactIds, factFailure, openFacts, recordFrom, recordTies, sessionIdsOf, sessionNumbers } from "./recordRows.ts";

describe("recordTies", () => {
  it("ties to the place and the people, and to nothing when there are neither", () => {
    expect(recordTies({ locationId: "L", characterIds: ["a", "b"] })).toBe("location_id.eq.L,npc_id.in.(a,b)");
    expect(recordTies({ locationId: null, characterIds: ["a"] })).toBe("npc_id.in.(a)");
    expect(recordTies({ locationId: "L", characterIds: [] })).toBe("location_id.eq.L");
    expect(recordTies({ locationId: null, characterIds: [] })).toBeNull();
  });
});

describe("candidateFactIds", () => {
  it("a fact both tied and newest is read once", () => {
    expect(candidateFactIds([{ fact_id: "a" }, { fact_id: "b" }], [{ id: "b" }, { id: "c" }])).toEqual(["a", "b", "c"]);
  });
});

describe("openFacts", () => {
  it("a fact another fact closes is not shown; the closer is", () => {
    const facts = [{ id: "old" }, { id: "new" }];
    expect(openFacts(facts, [{ supersedes_id: "old" }]).map((f) => f.id)).toEqual(["new"]);
  });
});

describe("sessionIdsOf and sessionNumbers", () => {
  it("asks once for each session, none for a fact filed outside one, and a session with no number has no label", () => {
    expect(sessionIdsOf([{ session_id: "s1" }, { session_id: "s1" }, { session_id: null }])).toEqual(["s1"]);
    expect([...sessionNumbers([{ id: "s1", number: 3 }, { id: "s2", number: null }])]).toEqual([["s1", 3]]);
  });
});

describe("recordFrom", () => {
  const fact = (id: string, at: string, extra: Record<string, unknown> = {}) => ({ id, body: `body ${id}`, known_to_player: true, session_id: null, created_at: at, ...extra });

  it("reads oldest first, and a fact the player has not learned is hidden", () => {
    const out = recordFrom([fact("b", "2026-02-01"), fact("a", "2026-01-01", { known_to_player: false })], new Map());
    expect(out.map((f) => [f.id, f.hidden])).toEqual([["a", true], ["b", false]]);
  });

  it("keeps the newest RECORD_SECTION_MAX, dropping the oldest", () => {
    const rows = Array.from({ length: RECORD_SECTION_MAX + 2 }, (_, i) => fact(`f${i}`, `2026-01-${String(i + 1).padStart(2, "0")}`));
    const out = recordFrom([...rows].reverse(), new Map());
    expect(out).toHaveLength(RECORD_SECTION_MAX);
    expect(out[0].id).toBe("f2");
    expect(out[out.length - 1].id).toBe(`f${RECORD_SECTION_MAX + 1}`);
  });

  it("labels the session a fact was filed in, and none for one with no known number", () => {
    const out = recordFrom([fact("a", "2026-01-01", { session_id: "s1" }), fact("b", "2026-01-02", { session_id: "s9" })], new Map([["s1", 4]]));
    expect(out.map((f) => f.when)).toEqual(["Session 4", null]);
  });

  it("does not reorder the rows it was handed", () => {
    const rows = [fact("b", "2026-02-01"), fact("a", "2026-01-01")];
    recordFrom(rows, new Map());
    expect(rows.map((r) => r.id)).toEqual(["b", "a"]);
  });
});

describe("factFailure", () => {
  it("only a foreign-key or check failure of a fact to close is the narrator's to fix", () => {
    expect(factFailure("f", "23503")).toContain("not found");
    expect(factFailure("f", "23514")).toContain("not found");
    expect(factFailure(null, "23503")).toContain("could not be put on record");
    expect(factFailure("f", "500")).toContain("could not be put on record");
  });
});
