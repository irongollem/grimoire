import { describe, expect, it, vi } from "vitest";
import type { JudgeRequest } from "../_shared/typesafe";
import { buildHiddenIdentity, checkLinesForReveal, speaksTrueName, type RevealProbability } from "./disguiseCheck";

const p = (probability: number | null): RevealProbability => ({ probability, inputTokens: 5 });
// The herbalist Old Wenna is really Duke Varric Holt.
const hidden = buildHiddenIdentity("Duke Varric Holt", "Ordered the granary burned.", "Old Wenna");
const lineOf = (r: JudgeRequest): string => (r.state as { line: string }).line;

describe("checkLinesForReveal", () => {
  it("flags a line at exactly 0.4 and not one at 0.39 (measured: revealing lines 0.49 and up, safe ones 0.34 and down)", async () => {
    const probs: Record<string, number> = { at: 0.4, below: 0.39 };
    const res = await checkLinesForReveal({ lines: ["at", "below"], hidden, judgeReveal: async (r) => p(probs[lineOf(r)]) });
    expect(res.reveals).toEqual([true, false]);
  });

  it("keeps each flag with its own line, in order", async () => {
    const res = await checkLinesForReveal({ lines: ["a", "b", "c"], hidden, judgeReveal: async (r) => p(lineOf(r) === "b" ? 0.9 : 0.1) });
    expect(res.reveals).toEqual([false, true, false]);
    expect(res.inputTokens).toBe(15);
    expect(res.judged).toBe(3);
  });

  it("leaves lines unflagged and does not throw when judging fails", async () => {
    const judgeReveal = vi.fn(async (): Promise<RevealProbability> => { throw new Error("down"); });
    const res = await checkLinesForReveal({ lines: ["a", "b"], hidden, judgeReveal });
    expect(res.reveals).toEqual([false, false]);
    expect(res.judged).toBe(0);
  });

  it("treats a missing answer as unflagged, not as revealing", async () => {
    const res = await checkLinesForReveal({ lines: ["a"], hidden, judgeReveal: async () => p(null) });
    expect(res.reveals).toEqual([false]);
    expect(res.judged).toBe(0);
  });

  it("flags a line that speaks the true name even when the model calls it safe, or never answers", async () => {
    // The model scored "You may call me Varric" lowest of the revealing lines; the name is an exact fact, so code owns it.
    const line = "You may call me Varric, if we are to be honest.";
    const safe = await checkLinesForReveal({ lines: [line], hidden, judgeReveal: async () => p(0.05) });
    expect(safe.reveals).toEqual([true]);
    const down = await checkLinesForReveal({ lines: [line], hidden, judgeReveal: async () => { throw new Error("down"); } });
    expect(down.reveals).toEqual([true]);
  });

  it("asks whether the speaker lets the secret slip, with the cover named and the real name and past apart", async () => {
    const judgeReveal = vi.fn(async (_r: JudgeRequest, _s: AbortSignal) => p(0));
    await checkLinesForReveal({ lines: ["hello"], hidden, judgeReveal });
    expect(judgeReveal.mock.calls[0][0].state).toEqual({
      line: "hello",
      secret: { real_name: "Duke Varric Holt", past: "Ordered the granary burned." },
      cover: "Known to everyone as Old Wenna.",
    });
  });
});

describe("speaksTrueName", () => {
  it("is not set off by a title the true name carries, since anyone may say 'duke'", () => {
    expect(speaksTrueName("Dukes come and go. Herbs are faithful.", hidden)).toBe(false);
    expect(speaksTrueName("They say the old duke died in exile.", hidden)).toBe(false);
  });

  it("finds the surname or the first name as a whole word, whatever the case", () => {
    expect(speaksTrueName("The HOLT line ended with me.", hidden)).toBe(true);
    expect(speaksTrueName("Hold the lantern higher.", hidden)).toBe(false);
  });

  it("ignores a word the cover name shares with the true name, or every line naming the cover would be flagged", () => {
    const shared = buildHiddenIdentity("Wenna Holt", "", "Old Wenna");
    expect(speaksTrueName("Old Wenna knows her herbs.", shared)).toBe(false);
    expect(speaksTrueName("A Holt never forgets.", shared)).toBe(true);
  });
});
