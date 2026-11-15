import { describe, expect, it } from "vitest";
import {
  canCreateFromPage,
  defaultDecision,
  LINK_VERDICT,
  deityCandidatesFor,
  withDeityCandidates,
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
    verdict: null,
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
            { targetId: "mon-1", source: "campaign", name: "Kobold", matchKind: "exact", detail: null, distance: null, verdict: null },
          ],
        },
      },
      semantic: true,
    };
    const { matches, semantic } = parseImportMatches(raw);
    expect(semantic).toBe(true);
    expect(matches.get("monsters")?.get("m1")).toEqual([
      { targetId: "mon-1", source: "campaign", name: "Kobold", matchKind: "exact", detail: null, distance: null, verdict: null },
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
      verdict: null,
    });
  });

  it("reads an empty detail string as no detail", () => {
    const raw = { matches: { npcs: { n1: [{ targetId: "npc-1", source: "campaign", name: "Reyes", matchKind: "exact", detail: "" }] } } };
    expect(parseImportMatches(raw).matches.get("npcs")?.get("n1")?.[0].detail).toBeNull();
  });

  it("keeps a near match, the name tier's one-keystroke-away verdict", () => {
    // `match_import_entity_names` returns 'near' for one of the DM's own rows a
    // single edit from the page's name. An unknown kind is dropped as malformed
    // (below), so this one has to be known here or the candidate vanishes.
    const raw = {
      matches: {
        npcs: {
          n1: [
            { targetId: "npc-1", source: "campaign", name: "Edgra Durnoot", matchKind: "near", detail: "Human", distance: null, verdict: null },
          ],
        },
      },
      semantic: true,
    };
    const { matches } = parseImportMatches(raw);
    expect(matches.get("npcs")?.get("n1")).toEqual([
      { targetId: "npc-1", source: "campaign", name: "Edgra Durnoot", matchKind: "near", detail: "Human", distance: null, verdict: null },
    ]);
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
    expect(parseImportMatches(null)).toEqual({ matches: new Map(), semantic: false, judged: false });
    expect(parseImportMatches("nope")).toEqual({ matches: new Map(), semantic: false, judged: false });
    expect(parseImportMatches({})).toEqual({ matches: new Map(), semantic: false, judged: false });
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

  it("is true when stat_block carries at least one meaningful field", () => {
    expect(canCreateFromPage("monsters", { name: "Grell", stat_block: { armor_class: 15 } })).toBe(true);
  });

  it("is false when stat_block's only keys are empty or blank placeholders", () => {
    expect(
      canCreateFromPage("monsters", {
        name: "Grell",
        stat_block: { saving_throws: "", senses: "   ", skills: {}, actions: [] },
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

describe("a candidate's verdict", () => {
  const rawWith = (extra: Record<string, unknown>) => ({
    matches: { npcs: { n1: [{ targetId: "id-1", source: "campaign", name: "Mara", matchKind: "similar", ...extra }] } },
  });
  const parsed = (extra: Record<string, unknown>) => parseImportMatches(rawWith(extra)).matches.get("npcs")?.get("n1");

  it("keeps a finite verdict from 0 to 2, boundaries included", () => {
    expect(parsed({ verdict: 1.5 })?.[0].verdict).toBe(1.5);
    expect(parsed({ verdict: 0 })?.[0].verdict).toBe(0);
    expect(parsed({ verdict: 2 })?.[0].verdict).toBe(2);
  });

  it("turns a malformed verdict into null and keeps the candidate", () => {
    for (const bad of [undefined, Number.NaN, "2", 2.1, -0.1, null]) {
      const found = parsed({ verdict: bad });
      expect(found).toHaveLength(1);
      expect(found?.[0].verdict).toBeNull();
    }
  });

  it("reports judged only when the response says exactly true", () => {
    expect(parseImportMatches({ matches: {}, judged: true }).judged).toBe(true);
    expect(parseImportMatches({ matches: {}, judged: "yes" }).judged).toBe(false);
    expect(parseImportMatches({ matches: {} }).judged).toBe(false);
  });
});

describe("defaultDecision with verdicts", () => {
  it("exports the measured threshold", () => {
    expect(LINK_VERDICT).toBe(1.5);
  });

  it("does not link a candidate judged 1.49 but links one judged 1.5", () => {
    expect(defaultDecision("npcs", { name: "Reyes" }, [candidate({ verdict: 1.49 })])).toEqual({ action: "create" });
    const at = candidate({ verdict: 1.5 });
    expect(defaultDecision("npcs", { name: "Reyes" }, [at])).toEqual({ action: "link", candidate: at });
  });

  it("links the highest verdict even when it is not first in the array", () => {
    const low = candidate({ targetId: "low", verdict: 1.0 });
    const high = candidate({ targetId: "high", verdict: 1.9 });
    expect(defaultDecision("npcs", { name: "Reyes" }, [low, high])).toEqual({ action: "link", candidate: high });
  });

  it("never links a quest, whatever the verdict", () => {
    expect(defaultDecision("quests", { title: "The Bell" }, [candidate({ verdict: 2 })])).toEqual({ action: "create" });
  });

  it("generates, not creates, a monster with no stat block when every verdict is low", () => {
    expect(defaultDecision("monsters", { name: "Grell" }, [candidate({ verdict: 0.4 })])).toEqual({ action: "generate" });
  });

  it("still links the first candidate when no candidate was judged (AI off)", () => {
    const first = candidate({ targetId: "a" });
    expect(defaultDecision("npcs", { name: "Reyes" }, [first, candidate({ targetId: "b" })])).toEqual({ action: "link", candidate: first });
  });

  it("links an unjudged exact deity candidate placed first, even when later ones were judged low", () => {
    const deity = candidate({ targetId: "god", source: "deity", verdict: null });
    expect(defaultDecision("npcs", { name: "Auril" }, [deity, candidate({ verdict: 0.2 })])).toEqual({ action: "link", candidate: deity });
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
    expect(normalizeMonsterReferenceRows([{ monster_id: "id-1", source: "campaign" }])).toEqual([]);
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

});

describe("deity candidates for an NPC", () => {
  const auril = { id: "d-auril", name: "Auril", titles: "the Frostmaiden" };
  const ra = { id: "d-ra", name: "Ra", titles: null };

  it("matches the same name exactly and a whole-word part of it as contains, either direction", () => {
    expect(deityCandidatesFor("Auril", [auril])[0]).toMatchObject({ source: "deity", targetId: "d-auril", matchKind: "exact", detail: "the Frostmaiden", distance: null, verdict: null });
    expect(deityCandidatesFor("Auril the Frostmaiden", [auril])[0]).toMatchObject({ matchKind: "contains" });
    expect(deityCandidatesFor("Auril", [{ id: "x", name: "Auril the Frostmaiden" }])[0]).toMatchObject({ matchKind: "contains" });
  });

  it("does not match a substring that is not a whole word, or a name too short to contain", () => {
    expect(deityCandidatesFor("Auri", [auril])).toEqual([]);
    expect(deityCandidatesFor("Ra the Sun", [ra])).toEqual([]);
    expect(deityCandidatesFor("Ra", [ra])[0]).toMatchObject({ matchKind: "exact" });
  });

  it("puts an exact deity first, so the default links to the god, and a partial one last", () => {
    const own = candidate({ targetId: "npc-1", name: "Auril's Herald", matchKind: "contains" });
    const out = withDeityCandidates(
      new Map([["n1", [own]]]),
      [{ ref: "n1", name: "Auril" }],
      [auril, { id: "d-aurilus", name: "Auril the Cold" }],
    );
    expect(out.get("n1")!.map((c) => c.targetId)).toEqual(["d-auril", "npc-1", "d-aurilus"]);
    expect(defaultDecision("npcs", { name: "Auril" }, out.get("n1")!)).toMatchObject({ action: "link", candidate: { source: "deity" } });
  });

  it("gives a ref with no server candidates an entry, and leaves the input untouched", () => {
    const input = new Map<string, readonly EntityCandidate[]>([["n2", [candidate()]]]);
    const out = withDeityCandidates(input, [{ ref: "n1", name: "Auril" }, { ref: "n2", name: "Nobody" }], [auril]);
    expect(out.get("n1")).toHaveLength(1);
    expect(out.get("n2")).toEqual([candidate()]);
    expect(input.has("n1")).toBe(false);
  });

  it("never accepts a deity or chosen candidate from the server", () => {
    const raw = { matches: { npcs: { n1: [
      { targetId: "d", source: "deity", name: "Auril", matchKind: "exact" },
      { targetId: "d", source: "campaign", name: "Auril", matchKind: "chosen" },
    ] } } };
    expect(parseImportMatches(raw).matches.size).toBe(0);
  });
});
