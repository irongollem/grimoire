import { describe, expect, it } from "vitest";
import {
  canCreateFromPage,
  defaultDecision,
  normalizeMonsterReferenceRows,
  parseImportMatches,
  type EntityCandidate,
} from "./entityMatching";

function candidate(overrides: Partial<EntityCandidate> = {}): EntityCandidate {
  return {
    targetId: "id-1",
    source: "campaign",
    name: "Kobold",
    matchKind: "exact",
    detail: null,
    distance: null,
    ...overrides,
  };
}

describe("parseImportMatches", () => {
  it("parses a well-formed response into the kind → ref → candidates map", () => {
    // Field names mirror `supabase/functions/import-match/matching.ts`'s own
    // `Candidate` type — already camelCase by the time it reaches the client.
    const raw = {
      matches: {
        monsters: {
          m1: [
            { targetId: "mon-1", source: "campaign", name: "Kobold", matchKind: "exact", detail: null, distance: null },
          ],
        },
      },
      semantic: true,
    };
    const { matches, semantic } = parseImportMatches(raw);
    expect(semantic).toBe(true);
    expect(matches.get("monsters")?.get("m1")).toEqual([
      { targetId: "mon-1", source: "campaign", name: "Kobold", matchKind: "exact", detail: null, distance: null },
    ]);
  });

  it("carries detail and distance through when present", () => {
    const raw = {
      matches: {
        monsters: {
          m1: [
            {
              targetId: "srd_owlbear",
              source: "library",
              name: "Owlbear",
              matchKind: "similar",
              detail: "Black Flag SRD",
              distance: 0.12,
            },
          ],
        },
      },
      semantic: true,
    };
    const { matches } = parseImportMatches(raw);
    expect(matches.get("monsters")?.get("m1")?.[0]).toEqual({
      targetId: "srd_owlbear",
      source: "library",
      name: "Owlbear",
      matchKind: "similar",
      detail: "Black Flag SRD",
      distance: 0.12,
    });
  });

  it("drops a malformed candidate rather than throwing or guessing", () => {
    const raw = {
      matches: {
        npcs: {
          n1: [
            { targetId: "", source: "campaign", name: "Reyes", matchKind: "exact" }, // empty targetId
            { targetId: "npc-1", source: "somewhere", name: "Reyes", matchKind: "exact" }, // bad source
            { targetId: "npc-1", source: "campaign", name: "Reyes", matchKind: "fuzzy" }, // bad matchKind
            { targetId: "npc-1", source: "campaign", matchKind: "exact" }, // missing name
            "not an object",
            null,
          ],
        },
      },
      semantic: false,
    };
    const { matches } = parseImportMatches(raw);
    // Every candidate for "n1" was malformed, so the ref never gets an
    // entry — and with no refs left, "npcs" never gets one either.
    expect(matches.has("npcs")).toBe(false);
  });

  it("drops an unrecognized kind key rather than crashing on it", () => {
    const raw = { matches: { dragons: { m1: [{ targetId: "x", source: "campaign", name: "X", matchKind: "exact" }] } }, semantic: false };
    const { matches } = parseImportMatches(raw);
    expect(matches.size).toBe(0);
  });

  it("returns empty for null, non-object, or missing matches", () => {
    expect(parseImportMatches(null)).toEqual({ matches: new Map(), semantic: false });
    expect(parseImportMatches("nope")).toEqual({ matches: new Map(), semantic: false });
    expect(parseImportMatches({})).toEqual({ matches: new Map(), semantic: false });
  });

  it("defaults semantic to false when it isn't exactly true", () => {
    expect(parseImportMatches({ matches: {}, semantic: "yes" }).semantic).toBe(false);
    expect(parseImportMatches({ matches: {} }).semantic).toBe(false);
  });
});

describe("canCreateFromPage", () => {
  it("is always true for a non-monster kind, whatever data holds", () => {
    expect(canCreateFromPage("npcs", {})).toBe(true);
    expect(canCreateFromPage("items", { name: "Sword" })).toBe(true);
  });

  it("is false for a monster with no stat_block at all", () => {
    expect(canCreateFromPage("monsters", { name: "Grell" })).toBe(false);
  });

  it("is false for a monster whose stat_block is an empty object", () => {
    expect(canCreateFromPage("monsters", { name: "Grell", stat_block: {} })).toBe(false);
  });

  it("is true when stat_block carries at least one meaningful field", () => {
    expect(canCreateFromPage("monsters", { name: "Grell", stat_block: { armor_class: 15 } })).toBe(true);
  });

  it("is false when stat_block's only keys are empty placeholders", () => {
    expect(
      canCreateFromPage("monsters", {
        name: "Grell",
        stat_block: { saving_throws: "", skills: {}, actions: [] },
      }),
    ).toBe(false);
  });

  it("treats a non-object stat_block as absent", () => {
    expect(canCreateFromPage("monsters", { name: "Grell", stat_block: "see appendix" })).toBe(false);
    expect(canCreateFromPage("monsters", { name: "Grell", stat_block: [1, 2] })).toBe(false);
  });
});

describe("defaultDecision", () => {
  it("links to the first candidate when any exist, for a non-quest kind", () => {
    const candidates = [candidate({ targetId: "a" }), candidate({ targetId: "b" })];
    expect(defaultDecision("npcs", { name: "Reyes" }, candidates)).toEqual({
      action: "link",
      candidate: candidates[0],
    });
  });

  it("creates when a non-quest kind has no candidates and can be created from the page", () => {
    expect(defaultDecision("npcs", { name: "Reyes" }, [])).toEqual({ action: "create" });
  });

  it("generates a monster with no candidates and no real stat block", () => {
    expect(defaultDecision("monsters", { name: "Grell" }, [])).toEqual({ action: "generate" });
  });

  it("creates a monster with no candidates but a real stat block", () => {
    expect(defaultDecision("monsters", { name: "Grell", stat_block: { armor_class: 13 } }, [])).toEqual({
      action: "create",
    });
  });

  it("links a monster over generating, when a candidate exists even without a stat block", () => {
    const candidates = [candidate({ targetId: "mon-1" })];
    expect(defaultDecision("monsters", { name: "Grell" }, candidates)).toEqual({
      action: "link",
      candidate: candidates[0],
    });
  });

  it("always creates a quest, even when a same-titled quest candidate exists", () => {
    const candidates = [candidate({ targetId: "quest-1", name: "The Sunken Bell" })];
    expect(defaultDecision("quests", { title: "The Sunken Bell" }, candidates)).toEqual({ action: "create" });
  });
});

describe("normalizeMonsterReferenceRows", () => {
  it("reads a campaign match from monster_id", () => {
    const rows = normalizeMonsterReferenceRows([
      { query_name: "Icewind kobold", monster_id: "id-1", library_monster_id: null, source: "campaign", matched_name: "Kobold", match_kind: "contains" },
    ]);
    expect(rows).toEqual([{ queryName: "Icewind kobold", targetId: "id-1" }]);
  });

  it("reads a library match from library_monster_id", () => {
    const rows = normalizeMonsterReferenceRows([
      { query_name: "Giant Rat", monster_id: null, library_monster_id: "srd_giant_rat", source: "library", matched_name: "Giant Rat", match_kind: "exact" },
    ]);
    expect(rows).toEqual([{ queryName: "Giant Rat", targetId: "srd_giant_rat" }]);
  });

  it("drops a row missing what it needs rather than guessing", () => {
    expect(normalizeMonsterReferenceRows([{ query_name: "Owlbear" }])).toEqual([]);
    expect(normalizeMonsterReferenceRows([null, undefined, "not an object", 42])).toEqual([]);
  });

  it("drops a campaign-sourced row whose monster_id is missing", () => {
    const rows = normalizeMonsterReferenceRows([
      { query_name: "Grell", monster_id: null, library_monster_id: "srd_grell", source: "campaign", matched_name: "Grell", match_kind: "exact" },
    ]);
    expect(rows).toEqual([]);
  });

  it("rejects an unrecognized source", () => {
    expect(
      normalizeMonsterReferenceRows([{ query_name: "Kobold", monster_id: "id-1", library_monster_id: null, source: "somewhere", matched_name: "Kobold", match_kind: "exact" }]),
    ).toEqual([]);
  });

  it("returns an empty array for an empty input", () => {
    expect(normalizeMonsterReferenceRows([])).toEqual([]);
  });
});
