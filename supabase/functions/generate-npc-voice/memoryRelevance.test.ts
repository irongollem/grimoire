import { describe, expect, it, vi } from "vitest";
import type { PromptNpcMemory, NpcMemoryIdentity } from "../_shared/npcMemories";
import {
  CENTRAL_MIN_SCORE,
  MEMORY_CANDIDATE_LIMIT,
  pickPromptMemories,
  RELEVANCE_QUESTION,
  selectPromptMemories,
  type RelevanceScore,
} from "./memoryRelevance";
import type { JudgeRequest } from "../_shared/typesafe";

const mem = (n: number, body = `memory ${n}`): PromptNpcMemory => ({
  kind: "event", body, created_at: `2026-01-${String(n % 28 + 1).padStart(2, "0")}`, sessionLabel: null, present: [],
});
const many = (n: number) => Array.from({ length: n }, (_, i) => mem(i));
const bodies = (ms: PromptNpcMemory[]) => ms.map((m) => m.body);
const plain: NpcMemoryIdentity = { name: "Bram Ashford", disguise_name: null, is_revealed: true };
const disguised: NpcMemoryIdentity = { name: "Bram Ashford", disguise_name: "Old Tom", is_revealed: false };

describe("constants", () => {
  it("reads 60 candidates (the spec's window)", () => {
    expect(MEMORY_CANDIDATE_LIMIT).toBe(60);
  });
});

describe("selectPromptMemories", () => {
  it("keeps a central memory older than the newest twelve (recency alone forgot the session-3 promise)", () => {
    const c = many(30);
    const scores = c.map((_, i) => (i === 2 ? 2 : 0));
    expect(bodies(selectPromptMemories(c, scores))).toContain("memory 2");
  });
  it("never exceeds twelve, even with all memories central", () => {
    const c = many(40);
    const out = selectPromptMemories(c, c.map(() => 2));
    expect(out).toHaveLength(12);
    expect(bodies(out)[11]).toBe("memory 39");
    expect(bodies(out)[0]).toBe("memory 28");
  });
  it("returns chronological order whatever the ranking was", () => {
    const c = many(30);
    const scores = c.map((_, i) => (i === 3 ? 2 : i === 10 ? 1 : 0));
    const out = bodies(selectPromptMemories(c, scores));
    const idx = out.map((b) => Number(b.split(" ")[1]));
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
  });
  it("ranks central, then related, then newest of the rest", () => {
    const c = many(30);
    const scores = c.map((_, i) => (i === 0 ? 2 : i === 1 ? 1 : null));
    const out = bodies(selectPromptMemories(c, scores));
    expect(out).toContain("memory 0");
    expect(out).toContain("memory 1");
    expect(out).toContain("memory 29");
    expect(out).not.toContain("memory 18");
    expect(out).toHaveLength(12);
  });
  it("puts a score of exactly 1.5 in central and 0.5 in related (boundaries)", () => {
    const c = many(30);
    const centralEdge = c.map((_, i) => (i === 0 ? CENTRAL_MIN_SCORE : 0));
    expect(bodies(selectPromptMemories(c, centralEdge))).toContain("memory 0");
    const relatedEdge = c.map((_, i) => (i === 0 ? 0.5 : i === 1 ? 0.49 : 0));
    const out = bodies(selectPromptMemories(c, relatedEdge));
    expect(out).toContain("memory 0");
    expect(out).not.toContain("memory 1");
  });
});

describe("pickPromptMemories", () => {
  const ok = (score: number | null): RelevanceScore => ({ score, inputTokens: 10 });

  it("makes no request with twelve or fewer memories", async () => {
    const judgeScore = vi.fn(async () => ok(2));
    const res = await pickPromptMemories({ candidates: many(12), situation: "s", identity: plain, apiKey: "k", judgeScore });
    expect(judgeScore).not.toHaveBeenCalled();
    expect(res.memories).toHaveLength(12);
  });
  it("makes no request without a key and returns the newest twelve", async () => {
    const judgeScore = vi.fn(async () => ok(2));
    const res = await pickPromptMemories({ candidates: many(40), situation: "s", identity: plain, apiKey: null, judgeScore });
    expect(judgeScore).not.toHaveBeenCalled();
    expect(bodies(res.memories)[0]).toBe("memory 28");
    expect(res.inputTokens).toBe(0);
  });
  it("falls back to the newest twelve when every judgment fails", async () => {
    const judgeScore = vi.fn(async (): Promise<RelevanceScore> => { throw new Error("down"); });
    const res = await pickPromptMemories({ candidates: many(40), situation: "s", identity: plain, apiKey: "k", judgeScore });
    expect(bodies(res.memories)).toEqual(bodies(many(40).slice(-12)));
    expect(res.judged).toBe(0);
  });
  it("treats a null score as unjudged, not as central", async () => {
    const judgeScore = vi.fn(async () => ok(null));
    const res = await pickPromptMemories({ candidates: many(40), situation: "s", identity: plain, apiKey: "k", judgeScore });
    expect(bodies(res.memories)).toEqual(bodies(many(40).slice(-12)));
  });
  it("sends the masked body, never the true name, for a disguised NPC", async () => {
    const requests: JudgeRequest[] = [];
    const judgeScore = vi.fn(async (r: JudgeRequest) => { requests.push(r); return ok(0); });
    const c = many(20).map((m, i) => (i === 0 ? { ...m, body: "Bram Ashford promised the key." } : m));
    await pickPromptMemories({ candidates: c, situation: "s", identity: disguised, apiKey: "k", judgeScore });
    const sent = JSON.stringify(requests);
    expect(sent).not.toContain("Bram");
    expect(sent).toContain("Old Tom promised the key.");
    expect(requests[0].questions[RELEVANCE_QUESTION]).toBeDefined();
  });
  it("picks the central old memory end to end and sums tokens", async () => {
    const judgeScore = vi.fn(async (r: JudgeRequest) =>
      ok((r.state as { memory: string }).memory === "memory 1" ? 2 : 0));
    const res = await pickPromptMemories({ candidates: many(30), situation: "s", identity: plain, apiKey: "k", judgeScore });
    expect(bodies(res.memories)).toContain("memory 1");
    expect(res.memories).toHaveLength(12);
    expect(res.inputTokens).toBe(300);
    expect(res.judged).toBe(30);
  });
});
