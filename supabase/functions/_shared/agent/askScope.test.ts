import { describe, expect, it, vi } from "vitest";
import { ASK_SCOPE_THRESHOLD, buildScopeRequest, checkScope, isShortFollowUp, SHORT_FOLLOW_UP_CHARS } from "./askScope.ts";
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

describe("buildScopeRequest", () => {
  it("asks one noul question named in_scope, with the message under the state", () => {
    const request = buildScopeRequest("who knows about the vault?", null);
    expect(Object.keys(request.questions)).toEqual(["in_scope"]);
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
