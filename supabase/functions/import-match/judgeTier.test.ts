import { describe, expect, it, vi } from "vitest";
import { judgingKey, runJudgingTier, type PairJudgment, type TierEntity } from "./judgeTier";
import { verdictKey } from "./judging";
import type { Candidate } from "./matching";

function cand(id: string, matchKind: Candidate["matchKind"] = "similar", distance: number | null = 0.1): Candidate {
  return { targetId: id, source: "campaign", name: id, matchKind, detail: null, distance, verdict: null };
}

const npcRow = (id: string) => ({
  id, name: `Name ${id}`, race: null, occupation: null, alignment: null, tags: [], appearance: null, personality: null, backstory: null,
});

function entity(key: string, ids: string[]): TierEntity {
  return { key, kind: "npcs", importedText: `imported ${key}`, pool: ids.map((id) => cand(id)) };
}

const loadAll = vi.fn(async (_k: string, _s: string, ids: string[]) => new Map(ids.map((id) => [id, npcRow(id)] as const)));
const ok = (score: number | null): PairJudgment => ({ score, model: "jev-1.14.0", inputTokens: 100 });

describe("judgingKey", () => {
  it("is null when AI is off, however the flag is spelled (no Jev call without ai_enabled === true)", () => {
    expect(judgingKey(false, "key")).toBeNull();
    expect(judgingKey(null, "key")).toBeNull();
    expect(judgingKey(undefined, "key")).toBeNull();
    expect(judgingKey("true", "key")).toBeNull();
  });
  it("is null with no platform key (no Jev call without a key)", () => {
    expect(judgingKey(true, undefined)).toBeNull();
    expect(judgingKey(true, "")).toBeNull();
  });
  it("returns the key when AI is on and a key exists", () => {
    expect(judgingKey(true, "key")).toBe("key");
  });
});

describe("runJudgingTier", () => {
  it("judges every planned pair once and records the verdict under its entity and candidate", async () => {
    const judgePair = vi.fn(async () => ok(1.8));
    const res = await runJudgingTier([entity("e1", ["a", "b"])], { loadRows: loadAll, judgePair });
    expect(judgePair).toHaveBeenCalledTimes(2);
    expect(res.verdicts.get(verdictKey("e1", cand("a")))).toBe(1.8);
    expect(res.judged).toBe(2);
    expect(res.inputTokens).toBe(200);
    expect(res.model).toBe("jev-1.14.0");
  });

  it("sends the imported text and the stored row's text as the state", async () => {
    const judgePair = vi.fn(async () => ok(0));
    await runJudgingTier([entity("e1", ["a"])], { loadRows: loadAll, judgePair });
    const request = (judgePair.mock.calls[0] as unknown as [{ state: { imported: string; existing: string } }])[0];
    expect(request.state.imported).toBe("imported e1");
    expect(request.state.existing).toContain("Name a");
  });

  it("a failed pair is left out of the verdicts so it falls back to the distance rule, and the others still count", async () => {
    const judgePair = vi.fn(async (req: { state: unknown }) => {
      if (JSON.stringify(req.state).includes("Name b")) throw new Error("boom");
      return ok(2);
    });
    const res = await runJudgingTier([entity("e1", ["a", "b"])], { loadRows: loadAll, judgePair });
    expect([...res.verdicts.keys()]).toEqual([verdictKey("e1", cand("a"))]);
    expect(res.judged).toBe(1);
  });

  it("a candidate whose row cannot be read is unjudged and costs no request", async () => {
    const loadRows = vi.fn(async (_k: string, _s: string, ids: string[]) =>
      new Map(ids.filter((id) => id !== "b").map((id) => [id, npcRow(id)] as const)));
    const judgePair = vi.fn(async () => ok(1));
    const res = await runJudgingTier([entity("e1", ["a", "b"])], { loadRows, judgePair });
    expect(judgePair).toHaveBeenCalledTimes(1);
    expect(res.verdicts.has(verdictKey("e1", cand("b")))).toBe(false);
  });

  it("a row read that throws leaves that group unjudged instead of failing the tier", async () => {
    const loadRows = vi.fn(async () => { throw new Error("db down"); });
    const judgePair = vi.fn(async () => ok(1));
    const res = await runJudgingTier([entity("e1", ["a"])], { loadRows, judgePair });
    expect(judgePair).not.toHaveBeenCalled();
    expect(res.judged).toBe(0);
    expect(res.model).toBeNull();
  });

  it("reads each kind and source once, with the ids deduplicated across entities", async () => {
    const loadRows = vi.fn(loadAll);
    await runJudgingTier([entity("e1", ["a", "b"]), entity("e2", ["b", "c"])], { loadRows, judgePair: async () => ok(1) });
    expect(loadRows).toHaveBeenCalledTimes(1);
    expect([...(loadRows.mock.calls[0][2])].sort()).toEqual(["a", "b", "c"]);
  });

  it("honours the per-entity cap: the ninth candidate is never sent", async () => {
    const ids = Array.from({ length: 10 }, (_, i) => `c${i}`);
    const judgePair = vi.fn(async () => ok(1));
    await runJudgingTier([entity("e1", ids)], { loadRows: loadAll, judgePair });
    expect(judgePair).toHaveBeenCalledTimes(8);
  });

  it("honours the per-request cap", async () => {
    const judgePair = vi.fn(async () => ok(1));
    await runJudgingTier(
      [entity("e1", ["a", "b", "c"]), entity("e2", ["d", "e", "f"])],
      { loadRows: loadAll, judgePair, perRequest: 4 },
    );
    expect(judgePair).toHaveBeenCalledTimes(4);
  });

  it("pairs unfinished at the deadline are unjudged and the tier still returns the finished ones", async () => {
    const judgePair = vi.fn((req: { state: unknown }) =>
      JSON.stringify(req.state).includes("Name slow")
        ? new Promise<PairJudgment>(() => {})
        : Promise.resolve(ok(2)));
    const loadRows = async (_k: string, _s: string, ids: string[]) =>
      new Map(ids.map((id) => [id, { ...npcRow(id), name: id === "slow" ? "Name slow" : `Name ${id}` }] as const));
    const res = await runJudgingTier([entity("e1", ["fast", "slow"])], { loadRows, judgePair, deadlineMs: 30 });
    expect(res.verdicts.has(verdictKey("e1", cand("fast")))).toBe(true);
    expect(res.verdicts.has(verdictKey("e1", cand("slow")))).toBe(false);
  });

  it("counts tokens even when an answer carries no score, and records no verdict for it", async () => {
    const res = await runJudgingTier([entity("e1", ["a"])], { loadRows: loadAll, judgePair: async () => ok(null) });
    expect(res.inputTokens).toBe(100);
    expect(res.verdicts.size).toBe(0);
  });

  it("with nothing to judge it calls nothing", async () => {
    const loadRows = vi.fn(loadAll);
    const res = await runJudgingTier([entity("e1", [])], { loadRows, judgePair: async () => ok(1) });
    expect(loadRows).not.toHaveBeenCalled();
    expect(res.judged).toBe(0);
  });
});
