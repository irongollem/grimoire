import { describe, expect, it } from "vitest";
import {
  audienceLabel,
  groupPerCharacter,
  groupQuestSteps,
  shapeLearned,
  joinNames,
  learnedEntryLink,
  questStepLine,
  sortLearned,
  suggestSession,
  type RevealRow,
} from "@/lib/sessions/learned";
import type { CampaignSession } from "@/types/session.types";

const party = [
  { id: "m1", name: "Wren" },
  { id: "m2", name: "Brakka" },
  { id: "m3", name: "Thessaly" },
];

function reveal(over: Partial<RevealRow>): RevealRow {
  return {
    entityId: "npc-1",
    name: "Old Marta",
    partyMemberId: "m1",
    revealedAt: "2026-10-01T19:00:00Z",
    approximate: false,
    sessionId: null,
    ...over,
  };
}

const source = { kind: "person", table: "npc_reveals", entityColumn: "npc_id" } as const;

function session(over: Partial<CampaignSession>): CampaignSession {
  return {
    id: "s",
    campaign_id: "c",
    user_id: "u",
    number: null,
    title: null,
    played_on: null,
    started_at: null,
    ended_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

describe("joinNames", () => {
  it("reads as a sentence", () => {
    expect(joinNames([])).toBe("");
    expect(joinNames(["Wren"])).toBe("Wren");
    expect(joinNames(["Wren", "Brakka"])).toBe("Wren and Brakka");
    expect(joinNames(["Wren", "Brakka", "Thessaly"])).toBe("Wren, Brakka and Thessaly");
  });
});

describe("audienceLabel", () => {
  it("says the whole party when everyone has it", () => {
    expect(audienceLabel(["m1", "m2", "m3"], party)).toBe("The whole party");
  });
  it("names a subset in party order", () => {
    expect(audienceLabel(["m3", "m1"], party)).toBe("Wren and Thessaly");
  });
  it("drops members who left the party", () => {
    expect(audienceLabel(["m1", "gone"], party)).toBe("Wren");
    expect(audienceLabel(["gone"], party)).toBe("");
  });
  it("never claims the whole party for an empty party", () => {
    expect(audienceLabel(["m1"], [])).toBe("");
  });
});

describe("groupPerCharacter", () => {
  it("folds one entity's rows in one session into one entry", () => {
    const entries = groupPerCharacter(
      [
        reveal({ partyMemberId: "m2", revealedAt: "2026-10-01T19:05:00Z" }),
        reveal({ partyMemberId: "m1" }),
      ],
      party,
      source,
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "person",
      name: "Old Marta",
      detail: "Wren and Brakka",
      whenIso: "2026-10-01T19:00:00Z",
      sessionId: null,
    });
    expect(entries[0]?.recordRefs).toEqual([
      { table: "npc_reveals", match: { npc_id: "npc-1", party_member_id: "m1" } },
      { table: "npc_reveals", match: { npc_id: "npc-1", party_member_id: "m2" } },
    ]);
  });

  it("says the whole party", () => {
    const rows = party.map((m) => reveal({ partyMemberId: m.id }));
    expect(groupPerCharacter(rows, party, source)[0]?.detail).toBe("The whole party");
  });

  it("keeps one entity's rows in different sessions apart", () => {
    const entries = groupPerCharacter(
      [reveal({ sessionId: "a" }), reveal({ partyMemberId: "m2", sessionId: "b" })],
      party,
      source,
    );
    expect(entries.map((e) => e.sessionId).sort()).toEqual(["a", "b"]);
  });

  it("keeps different entities apart and carries the approximate flag", () => {
    const entries = groupPerCharacter(
      [reveal({ approximate: true }), reveal({ entityId: "npc-2", name: "Joss" })],
      party,
      source,
    );
    expect(entries).toHaveLength(2);
    expect(entries.find((e) => e.entityId === "npc-1")?.approximate).toBe(true);
  });
});

describe("quest steps", () => {
  it("words each step", () => {
    expect(questStepLine("enter", "The Mere")).toBe("Began · The Mere");
    expect(questStepLine("forward", "The Tower")).toBe("Advanced · The Tower");
    expect(questStepLine("forward", null)).toBe("Advanced");
  });

  it("groups steps per quest and session, in order", () => {
    const entries = groupQuestSteps([
      { id: "t2", questId: "q1", questTitle: "Into the Mere", beatTitle: "Tower", transitionKind: "forward", createdAt: "2026-10-01T20:00:00Z", seq: 2, sessionId: "s1" },
      { id: "t1", questId: "q1", questTitle: "Into the Mere", beatTitle: "Gate", transitionKind: "enter", createdAt: "2026-10-01T19:00:00Z", seq: 1, sessionId: "s1" },
      { id: "t3", questId: "q2", questTitle: "Lost Ring", beatTitle: "Start", transitionKind: "enter", createdAt: "2026-10-01T19:30:00Z", seq: 3, sessionId: "s1" },
    ]);
    expect(entries).toHaveLength(2);
    const mere = entries.find((e) => e.entityId === "q1");
    expect(mere?.detail).toBe("Began · Gate\nAdvanced · Tower");
    expect(mere?.recordRefs.map((r) => r.match)).toEqual([{ id: "t1" }, { id: "t2" }]);
  });
});

describe("sortLearned", () => {
  it("puts the newest first", () => {
    const [a, b] = groupPerCharacter(
      [reveal({}), reveal({ entityId: "npc-2", revealedAt: "2026-10-03T19:00:00Z" })],
      party,
      source,
    );
    if (!a || !b) throw new Error("expected two entries");
    expect(sortLearned([a, b]).map((e) => e.entityId)).toEqual(["npc-2", "npc-1"]);
  });
});

describe("suggestSession", () => {
  const eleven = session({ id: "s11", number: 11, started_at: "2026-09-20T18:00:00Z", ended_at: "2026-09-20T22:00:00Z" });
  const twelve = session({ id: "s12", number: 12, started_at: "2026-10-04T18:00:00Z", ended_at: "2026-10-04T22:00:00Z" });
  const log = [eleven, twelve];

  it("takes the session whose span holds the moment", () => {
    expect(suggestSession("2026-10-04T19:00:00Z", log)).toEqual({ sessionId: "s12", label: "Session 12?" });
  });

  it("takes a running session for a moment after it began", () => {
    const running = session({ id: "s13", number: 13, started_at: "2026-10-10T18:00:00Z" });
    expect(suggestSession("2026-10-11T01:00:00Z", [...log, running])?.sessionId).toBe("s13");
  });

  it("takes the next session for a moment shared during prep", () => {
    expect(suggestSession("2026-10-01T12:00:00Z", log)).toEqual({ sessionId: "s12", label: "Session 12 (next)?" });
  });

  it("takes the earliest of several later sessions", () => {
    expect(suggestSession("2026-09-01T12:00:00Z", log)?.sessionId).toBe("s11");
  });

  it("falls back to the latest session before the moment", () => {
    expect(suggestSession("2026-12-01T12:00:00Z", log)).toEqual({ sessionId: "s12", label: "Session 12?" });
  });

  it("covers the whole day of a session logged by hand", () => {
    const past = session({ id: "p", number: 3, played_on: "2026-08-15" });
    expect(suggestSession("2026-08-15T12:00:00", [past])?.sessionId).toBe("p");
  });

  it("names an unnumbered session by its title", () => {
    const one = session({ id: "o", title: "One-shot", started_at: "2026-10-04T18:00:00Z", ended_at: "2026-10-04T22:00:00Z" });
    expect(suggestSession("2026-10-04T19:00:00Z", [one])?.label).toBe("One-shot?");
  });

  it("has no suggestion for an empty or undated log, or a bad date", () => {
    expect(suggestSession("2026-10-04T19:00:00Z", [])).toBeNull();
    expect(suggestSession("2026-10-04T19:00:00Z", [session({ id: "u" })])).toBeNull();
    expect(suggestSession("not a date", log)).toBeNull();
  });
});

describe("shapeLearned", () => {
  it("shapes every kind, newest first, with whole-party creatures and read-only combat", () => {
    const entries = shapeLearned(
      {
        person: [reveal({})],
        place: [],
        handout: [],
        creatures: [
          { id: "d1", entityId: "srd_owlbear", name: "Owlbear", visibleTo: null, discoveredAt: "2026-10-02T19:00:00Z", sessionId: null },
          { id: "d2", entityId: "m9", name: "Gloom Hound", visibleTo: ["m2"], discoveredAt: "2026-10-02T20:00:00Z", sessionId: null },
        ],
        quests: [],
        combat: [{ id: "e1", encounterId: "enc1", name: "Bridge ambush", whenIso: "2026-10-03T19:00:00Z", sessionId: null }],
      },
      party,
    );
    expect(entries.map((e) => e.name)).toEqual(["Bridge ambush", "Gloom Hound", "Owlbear", "Old Marta"]);
    expect(entries.find((e) => e.name === "Owlbear")?.detail).toBe("The whole party");
    expect(entries.find((e) => e.name === "Gloom Hound")?.detail).toBe("Brakka");
    expect(entries.find((e) => e.kind === "combat")?.recordRefs).toEqual([]);
    expect(entries.find((e) => e.name === "Owlbear")?.recordRefs).toEqual([
      { table: "discovered_monsters", match: { id: "d1" } },
    ]);
  });
});

describe("learnedEntryLink", () => {
  it("leads to the entity's own page", () => {
    expect(learnedEntryLink({ kind: "person", entityId: "a" })).toEqual({ path: "/npcs/a" });
    expect(learnedEntryLink({ kind: "place", entityId: "a" })).toEqual({ path: "/locations", query: { at: "a" } });
    expect(learnedEntryLink({ kind: "handout", entityId: "a" })).toEqual({ path: "/scriptorium/a" });
    expect(learnedEntryLink({ kind: "creature", entityId: "a" })).toEqual({ path: "/monsters/a" });
    expect(learnedEntryLink({ kind: "quest", entityId: "a" })).toEqual({ path: "/quests/a" });
    expect(learnedEntryLink({ kind: "combat", entityId: "a" })).toEqual({ path: "/encounters/a" });
  });
});
