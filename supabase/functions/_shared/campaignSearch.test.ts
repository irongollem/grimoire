import { describe, it, expect } from "vitest";
import {
  rankSearchHits,
  applyProbabilities,
  rerankPool,
  hitKey,
  noteHitLabel,
  CHRONICLER_NOTE_SCOPE,
  DM_SEARCH_NOTE_SCOPE,
  FAMILY_CAP,
  RERANK_POOL,
  type CampaignSearchHit,
  type CampaignSearchKind,
} from "./campaignSearch";

function hit(kind: CampaignSearchKind, name: string, distance: number, id = `${kind}-${name}`): CampaignSearchHit {
  return { kind, id, name, descriptor: null, distance };
}

describe("rankSearchHits", () => {
  it("returns nothing for no input", () => {
    expect(rankSearchHits([])).toEqual([]);
  });

  it("drops everything past the absolute ceiling (an unrelated query)", () => {
    expect(rankSearchHits([hit("npc", "A", 0.74), hit("note", "B", 0.77)])).toEqual([]);
  });

  it("drops hits more than 0.08 behind the best across all kinds", () => {
    const out = rankSearchHits([hit("npc", "Near", 0.53), hit("note", "Edge", 0.61), hit("quest", "Far", 0.62)]);
    expect(out.map((h) => h.name)).toEqual(["Near", "Edge"]);
  });

  it("caps the cut at 0.72 even when best + 0.08 would be higher", () => {
    const out = rankSearchHits([hit("npc", "A", 0.68), hit("note", "B", 0.73)]);
    expect(out.map((h) => h.name)).toEqual(["A"]);
  });

  it("sorts nearest first", () => {
    const out = rankSearchHits([hit("note", "B", 0.6), hit("npc", "A", 0.55), hit("quest", "C", 0.58)]);
    expect(out.map((h) => h.name)).toEqual(["A", "C", "B"]);
  });

  it("dedupes an item family by name, case-insensitively, the DM's own row winning", () => {
    const out = rankSearchHits([
      hit("library_item", "Flame Tongue", 0.54),
      hit("item", "flame tongue", 0.58),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("item");
  });

  it("keeps the nearer of two rows of the same name when neither is the DM's own advantage", () => {
    const libraryOnly = rankSearchHits([hit("library_item", "Lamp", 0.58, "far"), hit("library_item", "lamp", 0.54, "near")]);
    expect(libraryOnly.map((h) => h.id)).toEqual(["near"]);
    const ownOnly = rankSearchHits([hit("item", "Lamp", 0.58, "far"), hit("item", "lamp", 0.54, "near")]);
    expect(ownOnly.map((h) => h.id)).toEqual(["near"]);
  });

  it("dedupes the monster family the same way", () => {
    const out = rankSearchHits([
      hit("library_monster", "Griffon", 0.55),
      hit("monster", "GRIFFON", 0.6),
      hit("library_monster", "Owlbear", 0.56),
    ]);
    expect(out.map((h) => `${h.kind}:${h.name}`)).toEqual(["library_monster:Owlbear", "monster:GRIFFON"]);
  });

  it("does not dedupe across families or for non-item kinds", () => {
    const out = rankSearchHits([hit("npc", "Bram", 0.55), hit("note", "Bram", 0.56, "n1"), hit("note", "Bram", 0.57, "n2")]);
    expect(out).toHaveLength(3);
  });

  it("caps each family at five, an item and a library item sharing one", () => {
    const items = Array.from({ length: 4 }, (_, i) => hit("item", `I${i}`, 0.5 + i * 0.001));
    const lib = Array.from({ length: 4 }, (_, i) => hit("library_item", `L${i}`, 0.51 + i * 0.001));
    const npcs = Array.from({ length: 7 }, (_, i) => hit("npc", `N${i}`, 0.52 + i * 0.001));
    const out = rankSearchHits([...items, ...lib, ...npcs]);
    expect(out.filter((h) => h.kind === "item" || h.kind === "library_item")).toHaveLength(FAMILY_CAP);
    expect(out.filter((h) => h.kind === "npc")).toHaveLength(FAMILY_CAP);
  });
});

describe("applyProbabilities / rerankPool", () => {
  const probs = (entries: [CampaignSearchHit, number][]) => new Map(entries.map(([h, p]) => [hitKey(h), p]));

  it("pools the nearest 40 BEFORE the distance cut, so an answer past the cut is still judged", () => {
    const near = hit("npc", "Near", 0.5);
    const beyondCut = hit("note", "Right answer", 0.7); // best + 0.08 = 0.58: rankSearchHits drops it
    expect(rankSearchHits([near, beyondCut]).map((h) => h.name)).toEqual(["Near"]);
    expect(rerankPool([near, beyondCut]).map((h) => h.name)).toEqual(["Near", "Right answer"]);
  });

  it("keeps only the nearest RERANK_POOL hits across kinds", () => {
    const many = Array.from({ length: RERANK_POOL + 5 }, (_, i) => hit("note", `n${i}`, 0.5 + i / 1000));
    const pool = rerankPool(many);
    expect(pool).toHaveLength(RERANK_POOL);
    expect(pool[0].name).toBe("n0");
    expect(pool.at(-1)?.name).toBe(`n${RERANK_POOL - 1}`);
  });

  it("keeps a hit at exactly 0.5 and drops one at 0.49", () => {
    const a = hit("npc", "A", 0.5);
    const b = hit("npc", "B", 0.5);
    expect(applyProbabilities([a, b], probs([[a, 0.5], [b, 0.49]]))?.map((h) => h.name)).toEqual(["A"]);
  });

  it("orders by probability, not distance, and breaks ties by distance", () => {
    const near = hit("npc", "Near", 0.5);
    const far = hit("npc", "Far", 0.6);
    const tieNear = hit("quest", "TieNear", 0.52);
    const tieFar = hit("quest", "TieFar", 0.58);
    const out = applyProbabilities([near, far, tieFar, tieNear], probs([[near, 0.6], [far, 0.95], [tieNear, 0.8], [tieFar, 0.8]]));
    expect(out?.map((h) => h.name)).toEqual(["Far", "TieNear", "TieFar", "Near"]);
  });

  it("lets the DM's own row beat the library copy of the same name, even when the copy is judged higher", () => {
    const own = hit("item", "Flame Tongue", 0.6);
    const lib = hit("library_item", "flame tongue", 0.5);
    const out = applyProbabilities([lib, own], probs([[own, 0.7], [lib, 0.99]]));
    expect(out?.map((h) => h.kind)).toEqual(["item"]);
  });

  it("still caps each family at five after reranking", () => {
    const monsters = Array.from({ length: FAMILY_CAP + 3 }, (_, i) => hit("monster", `M${i}`, 0.5 + i / 100));
    const out = applyProbabilities(monsters, probs(monsters.map((m): [CampaignSearchHit, number] => [m, 0.9])));
    expect(out).toHaveLength(FAMILY_CAP);
  });

  it("answers an empty list, not null, when nothing reaches 0.5", () => {
    const a = hit("npc", "A", 0.5);
    expect(applyProbabilities([a], probs([[a, 0.1]]))).toEqual([]);
  });

  it("returns null when any pooled hit is unjudged, so the caller falls back", () => {
    const a = hit("npc", "A", 0.5);
    const b = hit("npc", "B", 0.6);
    expect(applyProbabilities([a, b], probs([[a, 0.9]]))).toBeNull();
  });
});

describe("note scopes", () => {
  it("lets the Chronicler read session notes only and the DM's search read every note", () => {
    // Fails if the recap writer is widened to planning notes (a spoiler leak), or the DM's search is narrowed.
    expect(CHRONICLER_NOTE_SCOPE.p_session_notes_only).toBe(true);
    expect(DM_SEARCH_NOTE_SCOPE.p_session_notes_only).toBe(false);
  });
});

describe("noteHitLabel", () => {
  it("names a session note by its session, and any other note just a note", () => {
    // Fails if the label falls back to the old category word, or hides which session a chronicle entry belongs to.
    expect(noteHitLabel(7)).toBe("Session 7");
    expect(noteHitLabel(null)).toBe("Note");
    expect(noteHitLabel(undefined)).toBe("Note");
  });
});
