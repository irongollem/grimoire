import { describe, expect, it, vi } from "vitest";
import { ASK_REPORT_THRESHOLD, ASK_SCOPE_THRESHOLD, buildScopeRequest, checkScope, isShortFollowUp, SHORT_FOLLOW_UP_CHARS } from "./askScope.ts";
import { SCOPE_FIXTURES } from "./askScope.fixtures.ts";
import type { JudgeRequest, JudgeResult } from "../typesafe.ts";

const answering = (probability: number | null): ((r: JudgeRequest) => Promise<JudgeResult>) => async () => {
  const answers: JudgeResult["answers"] = {};
  if (probability !== null) answers.in_scope = { type: "noul", noul: probability };
  return { model: "jev-1", inputTokens: 40, answers };
};
const quiet = () => vi.spyOn(console, "error").mockImplementation(() => undefined);

describe("the labelled set", () => {
  it("holds at least 20 in-scope and 20 out-of-scope messages, with terse and attack cases among them", () => {
    const inScope = SCOPE_FIXTURES.filter((f) => f.inScope);
    const out = SCOPE_FIXTURES.filter((f) => !f.inScope);
    expect(inScope.length).toBeGreaterThanOrEqual(20);
    expect(out.length).toBeGreaterThanOrEqual(20);
    expect(inScope.map((f) => f.message)).toEqual(expect.arrayContaining(["a half-elf about 27", "make it scarier", "who knows about the vault?"]));
    expect(out.some((f) => /ignore (all )?(previous|your) instructions/i.test(f.message))).toBe(true);
    expect(out.some((f) => /system prompt/i.test(f.message))).toBe(true);
  });
});

describe("checkScope", () => {
  it("refuses below the threshold and lets through at or above it", async () => {
    const e = null;
    expect((await checkScope({ message: "x", earlier: e, judgeScope: answering(ASK_SCOPE_THRESHOLD - 0.01) })).kind).toBe("off_topic");
    expect((await checkScope({ message: "x", earlier: e, judgeScope: answering(ASK_SCOPE_THRESHOLD) })).kind).toBe("in_scope");
    expect((await checkScope({ message: "x", earlier: e, judgeScope: answering(0.97) })).kind).toBe("in_scope");
  });

  it("takes the threshold it is given, so the live run can move it", async () => {
    expect((await checkScope({ message: "x", earlier: null, judgeScope: answering(0.5), threshold: 0.6 })).kind).toBe("off_topic");
  });

  it("fails open when there is no key, the judge throws or times out, or it answers without the probability", async () => {
    const spy = quiet();
    expect(await checkScope({ message: "x", earlier: null, judgeScope: async () => null })).toEqual({ kind: "unjudged" });
    expect(await checkScope({ message: "x", earlier: null, judgeScope: async () => { throw new Error("timeout"); } })).toEqual({ kind: "unjudged" });
    expect(await checkScope({ message: "x", earlier: null, judgeScope: answering(null) })).toEqual({ kind: "unjudged" });
    // the failures are logged, never silent
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it("sends the earlier turn with a short follow-up only, so 'yes' is judged in context", async () => {
    const earlier = { user: "I need a magic item", assistant: "With a picture?" };
    const calls: JudgeRequest[] = [];
    const judge = async (r: JudgeRequest) => { calls.push(r); return answering(0.9)(r); };
    await checkScope({ message: "yes", earlier, judgeScope: judge });
    await checkScope({ message: "a".repeat(SHORT_FOLLOW_UP_CHARS + 1), earlier, judgeScope: judge });
    expect(calls[0].state).toMatchObject({ message: "yes", earlier: { the_dm_said: "I need a magic item", the_assistant_said: "With a picture?" } });
    expect(calls[1].state).not.toHaveProperty("earlier");
  });
});

describe("the scope question wording", () => {
  const request = buildScopeRequest("how do I share a note with one player?", null).questions.in_scope as { instructions: string; criteria: { true: string; false: string } };

  // Bug caught: the judge refusing "how do I share a note with one player?" as off-topic once Ask answers from the
  // manual. The live threshold run still has to confirm the judge agrees (it cannot be called from a test).
  it("puts a question about using Grimoire in the true criteria and the instructions", () => {
    expect(request.criteria.true).toMatch(/how to use the app itself/i);
    expect(request.instructions).toMatch(/how to use the tool itself/i);
    expect(request.criteria.false).not.toMatch(/the assistant itself/i);
  });

  // Bug caught: widening the scope by dropping the prompt-injection guard along with the "assistant itself" wording.
  it("keeps the assistant's instructions and 'reveal your rules' in the false criteria", () => {
    expect(request.criteria.false).toMatch(/instructions/i);
    expect(request.criteria.false).toMatch(/reveal/i);
  });

  it("labels app-usage questions in scope and keeps the prompt attacks out", () => {
    const messages = SCOPE_FIXTURES.filter((f) => f.inScope).map((f) => f.message);
    expect(messages).toEqual(expect.arrayContaining(["how do I share a note with one player?", "where is the soundboard?"]));
    expect(SCOPE_FIXTURES.some((f) => !f.inScope && /system prompt/i.test(f.message))).toBe(true);
  });
});

describe("buildScopeRequest", () => {
  it("asks a noul question named in_scope first, with the message under the state", () => {
    const request = buildScopeRequest("who knows about the vault?", null);
    expect(Object.keys(request.questions)[0]).toBe("in_scope");
    expect(request.questions.in_scope.type).toBe("noul");
    expect(request.state).toEqual({ message: "who knows about the vault?" });
  });

  it("leaves out an earlier turn with nothing in it, and cuts a long one", () => {
    expect(buildScopeRequest("yes", { user: null, assistant: "  " }).state).not.toHaveProperty("earlier");
    const long = buildScopeRequest("yes", { user: "x".repeat(2000), assistant: null }).state as { earlier: { the_dm_said: string } };
    expect(long.earlier.the_dm_said.length).toBeLessThanOrEqual(500);
  });

  it("counts a message as a short follow-up by its length", () => {
    expect(isShortFollowUp("yes")).toBe(true);
    expect(isShortFollowUp("x".repeat(SHORT_FOLLOW_UP_CHARS + 1))).toBe(false);
  });
});

describe("the report verdict", () => {
  const judged = (answers: Record<string, number>) => async (): Promise<JudgeResult> => ({
    model: "jev-1",
    inputTokens: 40,
    answers: Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, { type: "noul" as const, noul: v }])),
  });

  // Bug caught: the off-topic refusal running first, so a bug report (low in_scope) was refused with 422.
  it("is returned before the off-topic refusal, even when in_scope is far below its threshold", async () => {
    const verdict = await checkScope({ message: "the map is broken", earlier: null, judgeScope: judged({ in_scope: 0.02, app_report: 0.9, is_bug: 0.95 }) });
    expect(verdict).toEqual({ kind: "report", report: "bug", probability: 0.9 });
  });

  // Bug caught: bug and feature swapped, or every report filed as a bug.
  it("says feature when is_bug is low", async () => {
    const verdict = await checkScope({ message: "add dark mode", earlier: null, judgeScope: judged({ in_scope: 0.03, app_report: 0.8, is_bug: 0.1 }) });
    expect(verdict).toMatchObject({ kind: "report", report: "feature" });
  });

  // Bug caught: a campaign request taken for a report, answered with a form instead of an answer.
  it("does not take a campaign request for a report, and falls back to the scope verdicts", async () => {
    expect((await checkScope({ message: "make it scarier", earlier: null, judgeScope: judged({ in_scope: 0.9, app_report: ASK_REPORT_THRESHOLD - 0.01, is_bug: 0.9 }) })).kind).toBe("in_scope");
    expect((await checkScope({ message: "write python", earlier: null, judgeScope: judged({ in_scope: 0.02, app_report: 0.1 }) })).kind).toBe("off_topic");
    expect((await checkScope({ message: "x", earlier: null, judgeScope: judged({ in_scope: 0.9, app_report: ASK_REPORT_THRESHOLD }) })).kind).toBe("report");
  });

  // Bug caught: a judge that omits app_report refusing or crashing the turn instead of failing open.
  it("treats an answer without app_report as no report", async () => {
    expect((await checkScope({ message: "x", earlier: null, judgeScope: judged({ in_scope: 0.9 }) })).kind).toBe("in_scope");
  });

  // Bug caught: the report questions sent as a second judge call (added latency before every stream).
  it("asks all three questions in the one request", () => {
    expect(Object.keys(buildScopeRequest("x", null).questions)).toEqual(["in_scope", "app_report", "is_bug"]);
  });

  it("holds report fixtures of both kinds, and near-misses that are campaign requests", () => {
    const reports = SCOPE_FIXTURES.filter((f) => f.report !== undefined);
    expect(reports.filter((f) => f.report === "bug").length).toBeGreaterThanOrEqual(5);
    expect(reports.filter((f) => f.report === "feature").length).toBeGreaterThanOrEqual(5);
    expect(SCOPE_FIXTURES.filter((f) => f.inScope && /broken|wish|add a secret door|on fire/i.test(f.message)).length).toBeGreaterThanOrEqual(4);
  });
});
