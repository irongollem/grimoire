import { describe, expect, it } from "vitest";
import { narrationJudgeFor } from "./narrationJudge";
import type { JudgeResult } from "../_shared/typesafe";

const answer: JudgeResult = { model: "jev-1.14.0", answers: {}, inputTokens: 123 };

describe("narrationJudgeFor", () => {
  it("is null without a key, so the table shows everything rather than judging with nothing", async () => {
    expect(await narrationJudgeFor({ getKey: async () => undefined, record: async () => {} })).toBeNull();
    expect(await narrationJudgeFor({ getKey: async () => "", record: async () => {} })).toBeNull();
  });

  it("is null when the key cannot be read, and does not throw", async () => {
    const judge = await narrationJudgeFor({
      getKey: async () => {
        throw new Error("vault down");
      },
      record: async () => {},
    });
    expect(judge).toBeNull();
  });

  it("logs the tokens of an answered call under the alias, platform-paid", async () => {
    const logged: unknown[] = [];
    const judge = await narrationJudgeFor({
      getKey: async () => "k",
      record: async (log) => void logged.push(log),
      run: async () => answer,
    });
    await judge!({ state: {}, questions: {} });
    expect(logged).toEqual([{ model: "jev-latest", provider: "typesafe", input_tokens: 123 }]);
  });

  it("still hands back the verdict when the ledger write fails", async () => {
    const judge = await narrationJudgeFor({
      getKey: async () => "k",
      record: async () => {
        throw new Error("ledger down");
      },
      run: async () => answer,
    });
    expect(await judge!({ state: {}, questions: {} })).toBe(answer);
  });
});
