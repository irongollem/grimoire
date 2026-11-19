import { describe, it, expect, vi } from "vitest";
import { buildEntry, buildRerankRequest, cut, rerankHits, rowSourceFor, type BatchAnswer, type EntryFields } from "./rerank";
import { hitKey, rankSearchHits, RERANK_BATCH, type CampaignSearchHit } from "../_shared/campaignSearch";
import type { JudgeRequest } from "../_shared/typesafe";

function hit(name: string, distance: number, kind: CampaignSearchHit["kind"] = "npc"): CampaignSearchHit {
  return { kind, id: `${kind}-${name}`, name, descriptor: null, distance };
}

/** A fake judge: probability by entry name, read back out of the request it was given. */
function judgeBy(byName: Record<string, number | null>, calls: JudgeRequest[] = []) {
  return async (request: JudgeRequest): Promise<BatchAnswer> => {
    calls.push(request);
    const entries = (request.state as { entries: Record<string, EntryFields> }).entries;
    const probabilities: Record<string, number | null> = {};
    for (const [key, entry] of Object.entries(entries)) probabilities[key] = byName[entry.name] ?? null;
    return { probabilities, inputTokens: 100 };
  };
}

describe("rerankHits", () => {
  it("makes no request for an empty pool", async () => {
    const judgeBatch = vi.fn();
    const out = await rerankHits("q", [], new Map(), judgeBatch);
    expect(judgeBatch).not.toHaveBeenCalled();
    expect(out.hits).toBeNull();
  });

  it("orders by the judge's probability and drops what it rejects", async () => {
    const pool = [hit("Near", 0.5), hit("Right", 0.6), hit("Wrong", 0.55)];
    const out = await rerankHits("q", pool, new Map(), judgeBy({ Near: 0.6, Right: 0.9, Wrong: 0.1 }));
    expect(out.hits?.map((h) => h.name)).toEqual(["Right", "Near"]);
    expect(out.succeeded).toBe(1);
    expect(out.inputTokens).toBe(100);
  });

  it("splits 40 hits into two requests of RERANK_BATCH", async () => {
    const pool = Array.from({ length: 40 }, (_, i) => hit(`n${i}`, 0.5 + i / 1000));
    const calls: JudgeRequest[] = [];
    const byName = Object.fromEntries(pool.map((h) => [h.name, 0.9]));
    await rerankHits("q", pool, new Map(), judgeBy(byName, calls));
    expect(calls.map((c) => Object.keys(c.questions).length)).toEqual([RERANK_BATCH, RERANK_BATCH]);
  });

  it("falls the whole search back to distance when one batch fails, so a half-judged list is never ordered", async () => {
    const pool = Array.from({ length: 40 }, (_, i) => hit(`n${i}`, 0.5 + i / 1000));
    let n = 0;
    const flaky = async (request: JudgeRequest): Promise<BatchAnswer> => {
      if (n++ === 1) throw new Error("timeout");
      return judgeBy(Object.fromEntries(pool.map((h) => [h.name, 0.9])))(request);
    };
    const out = await rerankHits("q", pool, new Map(), flaky);
    expect(out.hits).toBeNull();
    // The caller's fallback is today's ranking, and the spend of the answered request is still reported.
    expect(out.succeeded).toBe(1);
    expect(rankSearchHits(pool).length).toBeGreaterThan(0);
  });

  it("falls back when an answer omits a probability for one entry", async () => {
    const pool = [hit("A", 0.5), hit("B", 0.55)];
    const out = await rerankHits("q", pool, new Map(), judgeBy({ A: 0.9, B: null }));
    expect(out.hits).toBeNull();
  });

  it("answers an empty list when judged and nothing reaches 0.5", async () => {
    const out = await rerankHits("q", [hit("A", 0.5)], new Map(), judgeBy({ A: 0.2 }));
    expect(out.hits).toEqual([]);
  });

  it("sends a hit with no stored text as name and descriptor only", async () => {
    const calls: JudgeRequest[] = [];
    const h: CampaignSearchHit = { ...hit("Floss", 0.5), descriptor: "baker" };
    await rerankHits("q", [h], new Map(), judgeBy({ Floss: 0.9 }, calls));
    expect((calls[0].state as { entries: Record<string, EntryFields> }).entries.e0).toEqual({ name: "Floss", about: "baker" });
  });

  it("uses the entry text it was given for a hit", async () => {
    const calls: JudgeRequest[] = [];
    const h = hit("Floss", 0.5);
    await rerankHits("q", [h], new Map([[hitKey(h), { name: "Floss", text: "a baker" }]]), judgeBy({ Floss: 0.9 }, calls));
    expect((calls[0].state as { entries: Record<string, EntryFields> }).entries.e0.text).toBe("a baker");
  });
});

describe("buildRerankRequest", () => {
  it("asks the measured question once per entry, naming its path", () => {
    const req = buildRerankRequest("pig tavern", { e0: { name: "A" }, e1: { name: "B" } });
    expect(Object.keys(req.questions)).toEqual(["e0", "e1"]);
    expect(req.questions.e1).toMatchObject({
      type: "noul",
      instructions: "Is `entries.e1` what the person searching their campaign notes with `query` is looking for?",
    });
    expect(req.state).toEqual({ query: "pig tavern", entries: { e0: { name: "A" }, e1: { name: "B" } } });
  });
});

describe("buildEntry / rowSourceFor", () => {
  it("cuts a note's body to about 220 characters", () => {
    const entry = buildEntry(hit("Note", 0.5, "note"), { id: "x", title: "Note", content: "w ".repeat(300) });
    expect(entry.text?.length).toBeLessThanOrEqual(220);
  });
  it("reads a quest's summary", () => {
    expect(buildEntry(hit("Q", 0.5, "quest"), { id: "x", summary: "Find the key" }).text).toBe("Find the key");
  });
  it("keeps the name when the row has nothing usable", () => {
    expect(buildEntry(hit("Q", 0.5, "quest"), { id: "x", summary: null })).toEqual({ name: "Q" });
  });
  it("reads library kinds from the library tables and the DM's from their own", () => {
    expect(rowSourceFor("library_monster")?.table).toBe("library_monsters");
    expect(rowSourceFor("monster")?.table).toBe("monsters");
    expect(rowSourceFor("library_item")?.table).toBe("library_items");
    expect(rowSourceFor("note")?.table).toBe("notes");
    expect(rowSourceFor("quest")?.table).toBe("quests");
  });
  it("flattens whitespace when cutting", () => {
    expect(cut("a\n\n b", 10)).toBe("a b");
  });
});
