import { describe, expect, it, vi } from "vitest";
import type { JudgeRequest, JudgeResult } from "../_shared/typesafe";
import { narrationGate } from "./narration";
import type { AgentEvent } from "./turnTypes";
import type { AgentLine } from "../_shared/agent/types";

const line = (name: string, text: string): AgentLine => ({ kind: "spoken", speaker: { id: null, name }, text });

function gateWith(judged: boolean) {
  const events: AgentEvent[] = [];
  const gate = narrationGate({ judge: judged ? { keep: async (_lines: unknown, narration: string) => narration } as never : null, secrets: [], emit: (event) => events.push(event) });
  const lines = () => events.flatMap((e) => (e.type === "line" ? [`${e.line.speaker.name}: ${e.line.text}`] : []));
  return { gate, events, lines };
}

describe("lines said while an exchange is still going", () => {
  // Bug caught: a line shown the moment it is said and then again when the exchange ends, so every line of a
  // conversation appears twice.
  it.each([false, true])("are shown once, in order, and not again when the tool ends (judged: %s)", async (judged) => {
    const { gate, lines } = gateWith(judged);
    const one = line("Alda", "Where were you?");
    const two = line("Bren", "Asleep.");
    gate.onEvent({ type: "tool_start", id: "t1", name: "speak", input: {} });
    gate.said([one]);
    gate.said([two]);
    gate.onEvent({ type: "tool_end", id: "t1", name: "speak", isError: false, lines: [one, two] });
    await gate.finish();
    expect(lines()).toEqual(["Alda: Where were you?", "Bren: Asleep."]);
  });

  // Bug caught: a tool whose lines were never told early (any tool but an exchange) losing them at its end.
  it("still shows at the tool's end whatever was not shown before", async () => {
    const { gate, lines } = gateWith(false);
    const early = line("Alda", "First.");
    const late = line("Bren", "Second.");
    gate.said([early]);
    gate.onEvent({ type: "tool_end", id: "t1", name: "speak", isError: false, lines: [early, late] });
    await gate.finish();
    expect(lines()).toEqual(["Alda: First.", "Bren: Second."]);
  });
});

describe("narration with secrets in the campaign", () => {
  const SECRET = "THE-BARON-POISONED-THE-WELL";
  const leaky = (scoreOf: (sentence: string) => number) => {
    const requests: JudgeRequest[] = [];
    const judge = async (request: JudgeRequest): Promise<JudgeResult> => {
      requests.push(request);
      const sentences = (request.state as { sentences: string[] }).sentences;
      const answers: JudgeResult["answers"] = {};
      sentences.forEach((sentence, i) => {
        answers[`leak_${i}_0`] = { type: "noul", noul: scoreOf(sentence) };
      });
      return { model: "jev-1", inputTokens: 1, answers };
    };
    return { judge, requests };
  };
  const run = async (judge: (r: JudgeRequest) => Promise<JudgeResult>, secrets: string[], text: string) => {
    const events: AgentEvent[] = [];
    const shown = () => events.flatMap((e) => (e.type === "text" ? [e.delta] : []));
    const gate = narrationGate({ judge, secrets, emit: (e) => events.push(e) });
    gate.onEvent({ type: "text", delta: text });
    await Promise.resolve();
    const before = shown();
    gate.onEvent({ type: "step" } as never);
    await gate.finish();
    return { before, shown: shown(), events };
  };

  // Bug caught: text streamed to the browser before the leak check, because no line had been shown yet.
  it("holds the first step's text and shows only the sentences that do not state a secret", async () => {
    const j = leaky((s) => (s.includes("Baron") ? 0.95 : 0.01));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = await run(j.judge, [SECRET], "Rain falls. The Baron did it. Night comes.");
    expect(out.before).toEqual([]);
    expect(out.shown).toEqual(["Rain falls. Night comes."]);
    // Bug caught: the statement written into a log line.
    expect(JSON.stringify(warn.mock.calls)).not.toContain(SECRET);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  // Bug caught: every campaign's narration held and judged though it has nothing to guard.
  it("streams as before, with no judge call, when the campaign has no secrets", async () => {
    const j = leaky(() => 0.99);
    const out = await run(j.judge, [], "Rain falls.");
    expect(out.before).toEqual(["Rain falls."]);
    expect(j.requests).toHaveLength(0);
  });

  // Bug caught: a failing judge hiding the narration from the player.
  it("shows the text whole when the judge throws", async () => {
    const out = await run(async () => { throw new Error("down"); }, [SECRET], "Rain falls. The Baron did it.");
    expect(out.shown).toEqual(["Rain falls. The Baron did it."]);
  });

  // Bug caught: a slow judge stalling the turn past the limit.
  it("shows the text whole when the judge is slower than the limit", async () => {
    vi.useFakeTimers();
    try {
      const events: AgentEvent[] = [];
      const gate = narrationGate({ judge: () => new Promise<JudgeResult>(() => {}), secrets: [SECRET], emit: (e) => events.push(e) });
      gate.onEvent({ type: "text", delta: "Rain falls." });
      gate.onEvent({ type: "step" } as never);
      const done = gate.finish();
      await vi.advanceTimersByTimeAsync(1_600);
      await done;
      expect(events.flatMap((e) => (e.type === "text" ? [e.delta] : []))).toEqual(["Rain falls."]);
    } finally {
      vi.useRealTimers();
    }
  });
});
