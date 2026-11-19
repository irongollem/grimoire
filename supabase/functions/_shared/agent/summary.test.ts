/**
 * Sizes are worked out by hand from the estimate rule: 4,000 characters is 1,000 tokens, rounded up
 * (4,001 characters is 1,001). `text(n)` is n tokens of text.
 */
import { describe, expect, it } from "vitest";
import { estimateTokens, planSummary, summarise, summaryPrompt } from "./summary";
import type { StoredTurn } from "./transcript";
import type { AgentBlock, CallModel, ModelRequest, ModelStep } from "./types";

const text = (tokens: number, extra = 0) => "a".repeat(tokens * 4 + extra);
const say = (seq: number, role: "user" | "assistant", tokens: number, extra = 0): StoredTurn => ({
  seq,
  role,
  blocks: [{ type: "text", text: text(tokens, extra) }],
});
/** k turns of (user, assistant), each row `tokens` tokens: turn k is seq 2k-1 and 2k. */
const turns = (count: number, tokens: number): StoredTurn[] =>
  Array.from({ length: count }, (_, i) => [say(2 * i + 1, "user", tokens), say(2 * i + 2, "assistant", tokens)]).flat();

const usage = { provider: "openai", model: "m1", inputTokens: 5, outputTokens: 7, cacheReadTokens: 0, cacheWriteTokens: 0 };
function modelAnswering(step: Partial<ModelStep>): { callModel: CallModel; requests: ModelRequest[] } {
  const requests: ModelRequest[] = [];
  return {
    requests,
    callModel: async (request) => {
      requests.push(request);
      return { blocks: [{ type: "text", text: "The party is in the mine." }], stop: "end", usage, ...step };
    },
  };
}

describe("estimateTokens", () => {
  it("counts text, a call's name and input, and a result, and nothing for an opaque block", () => {
    const blocks: AgentBlock[] = [
      { type: "text", text: "a".repeat(40) }, // 40
      { type: "tool_call", id: "c", name: "roll", input: { n: 1 } }, // 4 + {"n":1} = 7 -> 11
      { type: "tool_result", callId: "c", content: "b".repeat(9), isError: false }, // 9
      { type: "opaque", provider: "openai", data: "z".repeat(10_000) }, // 0
    ];
    // 40 + 11 + 9 = 60 characters, 15 tokens
    expect(estimateTokens(blocks)).toBe(15);
  });

  it("rounds up: 4,001 characters is 1,001 tokens", () => {
    expect(estimateTokens([{ type: "text", text: "a".repeat(4001) }])).toBe(1001);
  });
});

describe("planSummary: when to fold", () => {
  it("leaves a conversation of exactly 12,000 tokens alone (a fold at >= instead of > goes red)", () => {
    // 12 rows of 1,000 tokens
    expect(planSummary(turns(6, 1000), 0)).toBeNull();
  });

  it("folds one just over 12,000 tokens, keeping only the newest turn when keeping two would pass 4,000", () => {
    const rows = turns(6, 1000);
    rows[11] = say(12, "assistant", 1000, 1); // 1,001 tokens: total 12,001
    // newest turn (11, 12) is 2,001; the one before it makes 4,001 > 4,000, so only the newest is kept
    const plan = planSummary(rows, 0);
    expect(plan?.throughSeq).toBe(10);
    expect(plan?.fold.map((r) => r.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("keeps whole turns up to exactly 4,000 tokens (a keep size that stops one turn early goes red)", () => {
    // newest turn 2,000 + the one before it 2,000 = 4,000, which fits; a third would make 6,000
    const plan = planSummary(turns(7, 1000), 0);
    expect(plan?.throughSeq).toBe(10);
    expect(plan?.fold).toHaveLength(10);
  });

  it("returns null when there is nothing to fold: one huge turn over the threshold", () => {
    expect(planSummary([say(1, "user", 13_000), say(2, "assistant", 100)], 0)).toBeNull();
  });

  it("returns null for a conversation with no turn start at all", () => {
    expect(planSummary([say(1, "assistant", 13_000)], 0)).toBeNull();
  });

  it("keeps the newest turn however big it is, and still folds the older ones", () => {
    const rows = [
      ...turns(2, 3000), // seq 1-4, 12,000 tokens
      say(5, "user", 6000), // the newest turn alone is 6,010 > 4,000
      say(6, "assistant", 10),
    ];
    const plan = planSummary(rows, 0);
    expect(plan?.throughSeq).toBe(4);
    expect(plan?.fold.map((r) => r.seq)).toEqual([1, 2, 3, 4]);
  });
});

describe("planSummary: the cut", () => {
  const call: AgentBlock = { type: "tool_call", id: "c1", name: "roll", input: { expression: "1d20" } };
  const result = (tokens: number): AgentBlock => ({ type: "tool_result", callId: "c1", content: text(tokens), isError: false });
  /** user text, the call, the result (5,000 tokens), the answer: a turn of four rows starting at `seq`. */
  const toolTurn = (seq: number): StoredTurn[] => [
    say(seq, "user", 100),
    { seq: seq + 1, role: "assistant", blocks: [call] },
    { seq: seq + 2, role: "user", blocks: [result(5000)] },
    say(seq + 3, "assistant", 100),
  ];

  it("cuts on a turn boundary, never between a tool call and its result", () => {
    // three turns of about 5,200 tokens each: 15,600 > 12,000. The newest (9-12) is over 4,000 and kept alone.
    const rows = [...toolTurn(1), ...toolTurn(5), ...toolTurn(9)];
    const plan = planSummary(rows, 0);
    expect(plan?.throughSeq).toBe(8);
    const folded = plan!.fold.flatMap((r) => r.blocks as AgentBlock[]);
    const calls = folded.filter((b) => b.type === "tool_call").length;
    const results = folded.filter((b) => b.type === "tool_result").length;
    expect(results).toBe(calls);
  });

  it("never folds a row the summary already covers", () => {
    // 12 turns of 2,000 tokens (seq 1-24), the first 8 rows already summarised: 9-24 is 16,000 > 12,000
    const plan = planSummary(turns(12, 1000), 8);
    expect(plan?.fold[0].seq).toBe(9);
    expect(plan?.throughSeq).toBe(20);
  });

  it("is not triggered by rows the summary already covers", () => {
    // all 12,000 tokens are in 12 rows; with 8 covered, 4,000 remain
    expect(planSummary(turns(6, 1000), 8)).toBeNull();
  });
});

describe("summaryPrompt", () => {
  it("shows the summariser only the first 1,500 characters of a tool result and marks the cut", () => {
    const fold: StoredTurn[] = [
      { seq: 1, role: "user", blocks: [{ type: "tool_result", callId: "c", content: "a".repeat(1500) + "b".repeat(500), isError: false }] },
    ];
    const { user } = summaryPrompt(null, fold);
    expect(user).toContain(`[It answered: ${"a".repeat(1500)} [cut]]`);
    expect(user).not.toContain("b");
  });

  it("does not mark a result of exactly 1,500 characters", () => {
    const fold: StoredTurn[] = [
      { seq: 1, role: "user", blocks: [{ type: "tool_result", callId: "c", content: "a".repeat(1500), isError: false }] },
    ];
    expect(summaryPrompt(null, fold).user).not.toContain("[cut]");
  });

  it("renders who said what, a call with its input, and leaves opaque blocks out", () => {
    const fold: StoredTurn[] = [
      { seq: 1, role: "user", blocks: [{ type: "text", text: "I open the door." }] },
      {
        seq: 2,
        role: "assistant",
        blocks: [
          { type: "opaque", provider: "openai", data: "REASONING-BLOB" },
          { type: "text", text: "It creaks." },
          { type: "tool_call", id: "c", name: "roll", input: { expression: "1d20" } },
        ],
      },
    ];
    const { user } = summaryPrompt(null, fold);
    expect(user).toContain("Player: I open the door.");
    expect(user).toContain("Dungeon Master: It creaks.");
    expect(user).toContain('[The Dungeon Master used roll with {"expression":"1d20"}]');
    expect(user).not.toContain("REASONING-BLOB");
  });

  it("puts the previous summary under its heading, before what happened next", () => {
    const { user } = summaryPrompt("The party reached Cup Town.", [say(1, "user", 1)]);
    expect(user.startsWith("## The record so far\n\nThe party reached Cup Town.")).toBe(true);
    expect(user.indexOf("## What happened next")).toBeGreaterThan(user.indexOf("Cup Town"));
  });

  it("has no record heading when there is no previous summary (or it is blank)", () => {
    expect(summaryPrompt(null, [say(1, "user", 1)]).user).not.toContain("The record so far");
    expect(summaryPrompt("  ", [say(1, "user", 1)]).user).not.toContain("The record so far");
  });
});

describe("summarise", () => {
  const fold = [say(1, "user", 1)];

  it("asks once, with no tools, no streaming and the 1,200 token cap", async () => {
    const { callModel, requests } = modelAnswering({});
    const out = await summarise({ callModel, previousSummary: null, fold });
    expect(requests).toHaveLength(1);
    expect(requests[0].tools).toEqual([]);
    expect(requests[0].onText).toBeUndefined();
    expect(requests[0].signal).toBeUndefined();
    expect(requests[0].maxOutputTokens).toBe(1200);
    expect(out).toEqual({ summary: "The party is in the mine.", usage });
  });

  it("joins the text blocks and trims", async () => {
    const { callModel } = modelAnswering({
      blocks: [{ type: "text", text: "  One. " }, { type: "text", text: "Two.  " }],
    });
    expect((await summarise({ callModel, previousSummary: null, fold })).summary).toBe("One. Two.");
  });

  it("gives null for a refusal, whatever text came with it, and still reports the tokens", async () => {
    const { callModel } = modelAnswering({ stop: "refusal", blocks: [{ type: "text", text: "I cannot." }] });
    expect(await summarise({ callModel, previousSummary: null, fold })).toEqual({ summary: null, usage });
  });

  it("gives null for an empty answer", async () => {
    const { callModel } = modelAnswering({ blocks: [{ type: "text", text: "   " }] });
    expect((await summarise({ callModel, previousSummary: null, fold })).summary).toBeNull();
  });

  it("keeps a record cut at the token cap", async () => {
    const { callModel } = modelAnswering({ stop: "max_tokens", blocks: [{ type: "text", text: "The party is in the" }] });
    expect((await summarise({ callModel, previousSummary: null, fold })).summary).toBe("The party is in the");
  });

  it("throws a provider error through", async () => {
    const callModel: CallModel = async () => {
      throw new Error("provider down");
    };
    await expect(summarise({ callModel, previousSummary: null, fold })).rejects.toThrow("provider down");
  });
});
