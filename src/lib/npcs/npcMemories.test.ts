import { describe, expect, it } from "vitest";
import { NPC_MEMORY_KINDS } from "@/types/npcMemory.types";
import {
  NPC_MEMORY_KIND_HINTS,
  NPC_MEMORY_KIND_LABELS,
  PLAYER_NPC_MEMORY_KIND_LABELS,
  defaultMemorySessionId,
  groupMemoriesBySession,
} from "./npcMemories";

const m = (id: string, session_id: string | null, created_at: string) => ({ id, session_id, created_at });

describe("kind copy", () => {
  it("covers every kind in all three tables", () => {
    for (const kind of NPC_MEMORY_KINDS) {
      expect(NPC_MEMORY_KIND_LABELS[kind]).toBeTruthy();
      expect(NPC_MEMORY_KIND_HINTS[kind]).toBeTruthy();
      expect(PLAYER_NPC_MEMORY_KIND_LABELS[kind]).toBeTruthy();
    }
  });
});

describe("groupMemoriesBySession", () => {
  const sessions = [{ id: "s2" }, { id: "s1" }];

  it("orders groups by the log and memories oldest first, null group last", () => {
    const groups = groupMemoriesBySession(
      [m("a", null, "2026-01-01"), m("b", "s1", "2026-02-02"), m("c", "s2", "2026-03-02"), m("d", "s1", "2026-02-01"), m("e", "s2", "2026-03-01")],
      sessions,
    );
    expect(groups.map((g) => g.sessionId)).toEqual(["s2", "s1", null]);
    expect(groups[0].memories.map((x) => x.id)).toEqual(["e", "c"]);
    expect(groups[1].memories.map((x) => x.id)).toEqual(["d", "b"]);
  });

  it("keeps a memory whose session is unknown, after known sessions and before null", () => {
    const groups = groupMemoriesBySession([m("a", null, "2026-01-01"), m("x", "gone", "2026-01-02"), m("b", "s1", "2026-01-03")], sessions);
    expect(groups.map((g) => g.sessionId)).toEqual(["s1", "gone", null]);
  });

  it("omits sessions with no memories and handles an empty list", () => {
    expect(groupMemoriesBySession([], sessions)).toEqual([]);
  });
});

describe("defaultMemorySessionId", () => {
  it("prefers the running session", () => {
    expect(defaultMemorySessionId({ id: "run" }, [{ id: "s1", started_at: "x", played_on: null }])).toBe("run");
  });
  it("falls back to the newest played session", () => {
    const log = [
      { id: "planned", started_at: null, played_on: null },
      { id: "logged", started_at: null, played_on: "2026-01-01" },
      { id: "older", started_at: "2025-01-01T00:00:00Z", played_on: null },
    ];
    expect(defaultMemorySessionId(null, log)).toBe("logged");
  });
  it("is null with nothing played", () => {
    expect(defaultMemorySessionId(null, [])).toBeNull();
    expect(defaultMemorySessionId(null, [{ id: "p", started_at: null, played_on: null }])).toBeNull();
  });
});
