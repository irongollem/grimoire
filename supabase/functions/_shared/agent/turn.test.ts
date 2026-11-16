import { describe, expect, it } from "vitest";
import { runTurn, totalTokens, type TurnEvent, type TurnInput } from "./turn";
import type { AgentBlock, AgentMessage, AgentUsage, ModelRequest, ModelStep } from "./types";

const usage = (over: Partial<AgentUsage> = {}): AgentUsage => ({
  provider: "test",
  model: "m",
  inputTokens: 10,
  outputTokens: 5,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  ...over,
});

const say = (text: string, u: Partial<AgentUsage> = {}): ModelStep => ({
  blocks: [{ type: "text", text }],
  stop: "end",
  usage: usage(u),
});

const call = (id: string, name = "roll", input: Record<string, unknown> = {}): AgentBlock => ({
  type: "tool_call",
  id,
  name,
  input,
});

const asks = (blocks: AgentBlock[], u: Partial<AgentUsage> = {}): ModelStep => ({
  blocks,
  stop: "tool_calls",
  usage: usage(u),
});

const tool = (name: string) => ({ name, description: name, inputSchema: { type: "object" } });

function setup(
  steps: Array<ModelStep | Error | ((r: ModelRequest) => ModelStep)>,
  over: Partial<TurnInput> & { tool?: TurnInput["callTool"] } = {},
) {
  const requests: ModelRequest[] = [];
  const toolCalls: string[] = [];
  const queue = [...steps];
  const callModel: TurnInput["callModel"] = async (request) => {
    // Snapshot: the loop keeps appending to its own array after the call returns.
    requests.push({ ...request, messages: structuredClone(request.messages) });
    const next = queue.shift();
    if (!next) throw new Error("script ran out of steps");
    if (next instanceof Error) throw next;
    return typeof next === "function" ? next(request) : next;
  };
  const callTool: TurnInput["callTool"] =
    over.tool ??
    (async (name) => {
      toolCalls.push(name);
      return { content: `${name} done`, isError: false };
    });
  const input: TurnInput = {
    system: "sys",
    history: [],
    user: "hello",
    tools: [tool("roll"), tool("look")],
    callModel,
    callTool,
    limits: { maxSteps: 10, maxOutputTokens: 100, tokenBudget: null },
    ...over,
  };
  return { input, requests, toolCalls };
}

const resultsOf = (m: AgentMessage) =>
  m.blocks.map((b) => (b.type === "tool_result" ? `${b.callId}:${b.isError ? "err" : "ok"}:${b.content}` : "?"));

/** The invariant the module exists for: no tool_call without its tool_result. */
function expectNoOrphanCalls(added: AgentMessage[]) {
  const called = added.flatMap((m) => m.blocks.flatMap((b) => (b.type === "tool_call" ? [b.id] : [])));
  const answered = added.flatMap((m) => m.blocks.flatMap((b) => (b.type === "tool_result" ? [b.callId] : [])));
  expect(answered.sort()).toEqual(called.sort());
}

describe("runTurn loop", () => {
  it("sends the model the assistant message and one tool-result message on the second call, or the adapter sees an invalid history", async () => {
    const { input, requests } = setup([asks([call("a"), call("b", "look")]), say("all done")]);
    const out = await runTurn(input);

    expect(out.end).toBe("done");
    expect(out.text).toBe("all done");
    expect(requests).toHaveLength(2);
    const second = requests[1].messages;
    expect(second.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(resultsOf(second[2])).toEqual(["a:ok:roll done", "b:ok:look done"]);
    expect(out.added.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
    expect(out.steps).toHaveLength(2);
    expectNoOrphanCalls(out.added);
  });

  it("puts history before the new message, or the model answers without the conversation so far", async () => {
    const history: AgentMessage[] = [
      { role: "user", blocks: [{ type: "text", text: "earlier" }] },
      { role: "assistant", blocks: [{ type: "text", text: "reply" }] },
    ];
    const { input, requests } = setup([say("ok")], { history });
    const out = await runTurn(input);
    expect(requests[0].messages.map((m) => visibleOf(m))).toEqual(["earlier", "reply", "hello"]);
    expect(out.added[0]).toEqual({ role: "user", blocks: [{ type: "text", text: "hello" }] });
  });

  it("never changes history and returns a new added array, or a stored conversation grows behind the caller's back", async () => {
    const history: AgentMessage[] = [{ role: "user", blocks: [{ type: "text", text: "earlier" }] }];
    const before = structuredClone(history);
    const { input } = setup([asks([call("a")]), say("x")], { history });
    const out = await runTurn(input);
    expect(history).toEqual(before);
    expect(out.added).not.toBe(history);
    expect(out.added.length).toBe(4);
  });

  it("keeps opaque blocks in the assistant message as they came, or a provider cannot replay its reasoning", async () => {
    const opaque: AgentBlock = { type: "opaque", provider: "openai", data: { id: "rs_1" } };
    const { input } = setup([{ blocks: [opaque, { type: "text", text: "hi" }], stop: "end", usage: usage() }]);
    const out = await runTurn(input);
    expect(out.added[1].blocks[0]).toEqual(opaque);
  });

  it("ends a turn the model stops with `other` as done, or the loop spins on an unknown stop reason", async () => {
    const { input } = setup([{ blocks: [{ type: "text", text: "hm" }], stop: "other", usage: usage() }]);
    expect((await runTurn(input)).end).toBe("done");
  });

  it("does not loop on `tool_calls` that holds no call, or an empty user message is sent", async () => {
    const { input, requests } = setup([{ blocks: [{ type: "text", text: "hm" }], stop: "tool_calls", usage: usage() }]);
    const out = await runTurn(input);
    expect(out.end).toBe("done");
    expect(requests).toHaveLength(1);
  });

  it("reports the text of the last assistant message, not an earlier one", async () => {
    const { input } = setup([
      asks([{ type: "text", text: "let me look" }, call("a")]),
      say("the answer"),
    ]);
    expect((await runTurn(input)).text).toBe("the answer");
  });

  it("answers with empty text when the last assistant message had none", async () => {
    const { input } = setup([asks([call("a")]), { blocks: [], stop: "end", usage: usage() }]);
    expect((await runTurn(input)).text).toBe("");
  });
});

describe("tools", () => {
  it("returns results in call order when the second tool finishes first, or the model reads answers against the wrong calls", async () => {
    const started: string[] = [];
    const { input } = setup([asks([call("a", "roll"), call("b", "look")]), say("ok")], {
      tool: async (name) => {
        started.push(name);
        // The first call is the slow one: it answers after the second has long finished.
        if (name === "roll") await new Promise((resolve) => setTimeout(resolve, 15));
        return { content: `${name}!`, isError: false };
      },
    });
    const out = await runTurn(input);
    expect(started).toEqual(["roll", "look"]);
    expect(resultsOf(out.added[2])).toEqual(["a:ok:roll!", "b:ok:look!"]);
  });

  it("starts every tool before waiting on any, or a slow tool serialises the turn", async () => {
    let inFlight = 0;
    let peak = 0;
    const { input } = setup([asks([call("a"), call("b"), call("c")]), say("ok")], {
      tool: async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await Promise.resolve();
        await Promise.resolve();
        inFlight--;
        return { content: "x", isError: false };
      },
    });
    await runTurn(input);
    expect(peak).toBe(3);
  });

  it("puts all results of one assistant message in ONE user message, or the model learns to stop calling tools in parallel", async () => {
    const { input } = setup([asks([call("a"), call("b")]), say("ok")]);
    const out = await runTurn(input);
    expect(out.added.filter((m) => m.role === "user")).toHaveLength(2);
  });

  it("answers an unknown tool with an error and never calls callTool for it, or the executor runs something that was never offered", async () => {
    const { input, toolCalls } = setup([asks([call("a", "delete_everything"), call("b", "look")]), say("ok")]);
    const out = await runTurn(input);
    expect(toolCalls).toEqual(["look"]);
    expect(resultsOf(out.added[2])).toEqual(["a:err:No such tool: delete_everything", "b:ok:look done"]);
  });

  it("turns a throwing tool into an error result and keeps its sibling's result, or one failure loses the whole turn", async () => {
    const { input } = setup([asks([call("a", "roll"), call("b", "look")]), say("ok")], {
      tool: async (name) => {
        if (name === "roll") throw new Error("dice broke");
        return { content: "fine", isError: false };
      },
    });
    const out = await runTurn(input);
    expect(out.end).toBe("done");
    expect(resultsOf(out.added[2])).toEqual(["a:err:dice broke", "b:ok:fine"]);
  });

  it("passes the call's input to the tool", async () => {
    const seen: Array<[string, Record<string, unknown>]> = [];
    const { input } = setup([asks([call("a", "roll", { sides: 20 })]), say("ok")], {
      tool: async (name, args) => {
        seen.push([name, args]);
        return { content: "17", isError: false };
      },
    });
    await runTurn(input);
    expect(seen).toEqual([["roll", { sides: 20 }]]);
  });
});

describe("limits", () => {
  it("does not run the tools the last allowed call asked for, answers them, and ends step_limit, or the stored conversation is invalid", async () => {
    const { input, toolCalls, requests } = setup([asks([call("a"), call("b")])], {
      limits: { maxSteps: 1, maxOutputTokens: 100, tokenBudget: null },
    });
    const out = await runTurn(input);
    expect(out.end).toBe("step_limit");
    expect(toolCalls).toEqual([]);
    expect(requests).toHaveLength(1);
    expect(resultsOf(out.added[2])).toEqual([
      "a:err:The turn ended before this tool ran: step limit.",
      "b:err:The turn ended before this tool ran: step limit.",
    ]);
    expectNoOrphanCalls(out.added);
  });

  it("makes at most maxSteps model calls, or a looping model runs up the bill", async () => {
    const { input, requests } = setup([asks([call("a")]), asks([call("b")]), asks([call("c")]), say("never")], {
      limits: { maxSteps: 2, maxOutputTokens: 100, tokenBudget: null },
    });
    const out = await runTurn(input);
    expect(requests).toHaveLength(2);
    expect(out.end).toBe("step_limit");
    expectNoOrphanCalls(out.added);
  });

  it("makes the first model call even with a budget of 0, or a turn with a spent budget returns nothing at all", async () => {
    const { input, requests } = setup([say("hello back")], {
      limits: { maxSteps: 5, maxOutputTokens: 100, tokenBudget: 0 },
    });
    const out = await runTurn(input);
    expect(requests).toHaveLength(1);
    expect(out.text).toBe("hello back");
    expect(out.end).toBe("done");
  });

  it("stops at the budget before running the tools, answers them, and ends budget", async () => {
    const { input, toolCalls, requests } = setup([asks([call("a")], { inputTokens: 80, outputTokens: 30 }), say("never")], {
      limits: { maxSteps: 5, maxOutputTokens: 100, tokenBudget: 100 },
    });
    const out = await runTurn(input);
    expect(out.end).toBe("budget");
    expect(toolCalls).toEqual([]);
    expect(requests).toHaveLength(1);
    expect(resultsOf(out.added[2])).toEqual(["a:err:The turn ended before this tool ran: token budget."]);
    expectNoOrphanCalls(out.added);
  });

  it("stops when the total EQUALS the budget, or a spent budget buys one more call", async () => {
    const { input } = setup([asks([call("a")], { inputTokens: 60, outputTokens: 40 }), say("never")], {
      limits: { maxSteps: 5, maxOutputTokens: 100, tokenBudget: 100 },
    });
    expect((await runTurn(input)).end).toBe("budget");
  });

  it("carries on under the budget", async () => {
    const { input } = setup([asks([call("a")], { inputTokens: 10, outputTokens: 5 }), say("ok")], {
      limits: { maxSteps: 5, maxOutputTokens: 100, tokenBudget: 100 },
    });
    expect((await runTurn(input)).end).toBe("done");
  });

  it("passes maxOutputTokens, system and tools to the model", async () => {
    const { input, requests } = setup([say("ok")], { limits: { maxSteps: 3, maxOutputTokens: 321, tokenBudget: null } });
    await runTurn(input);
    expect(requests[0].maxOutputTokens).toBe(321);
    expect(requests[0].system).toBe("sys");
    expect(requests[0].tools.map((t) => t.name)).toEqual(["roll", "look"]);
  });
});

describe("cut off and refusal", () => {
  it("keeps the text and drops the tool calls of a cut-off message, or a half-written call is stored without its result", async () => {
    const { input, toolCalls } = setup([
      { blocks: [{ type: "text", text: "I will" }, call("a")], stop: "max_tokens", usage: usage() },
    ]);
    const out = await runTurn(input);
    expect(out.end).toBe("max_tokens");
    expect(out.added[1]).toEqual({ role: "assistant", blocks: [{ type: "text", text: "I will" }] });
    expect(out.text).toBe("I will");
    expect(toolCalls).toEqual([]);
    expectNoOrphanCalls(out.added);
  });

  it("appends no assistant message when a cut-off one holds only a tool call, or an empty message poisons the history", async () => {
    const { input } = setup([{ blocks: [call("a")], stop: "max_tokens", usage: usage() }]);
    const out = await runTurn(input);
    expect(out.added.map((m) => m.role)).toEqual(["user"]);
    expect(out.text).toBe("");
  });

  it("appends what a refusal carried and ends refusal", async () => {
    const { input } = setup([{ blocks: [{ type: "text", text: "I can't" }], stop: "refusal", usage: usage() }]);
    const out = await runTurn(input);
    expect(out.end).toBe("refusal");
    expect(out.added[1].blocks).toEqual([{ type: "text", text: "I can't" }]);
    expect(out.text).toBe("I can't");
  });

  it("appends no message for a refusal with no blocks", async () => {
    const { input } = setup([{ blocks: [], stop: "refusal", usage: usage() }]);
    const out = await runTurn(input);
    expect(out.end).toBe("refusal");
    expect(out.added.map((m) => m.role)).toEqual(["user"]);
  });
});

describe("abort and errors", () => {
  it("makes no model call when the signal is already aborted, or a cancelled turn still bills", async () => {
    const ac = new AbortController();
    ac.abort();
    const { input, requests } = setup([say("never")], { signal: ac.signal });
    const out = await runTurn(input);
    expect(out.end).toBe("aborted");
    expect(requests).toHaveLength(0);
    expect(out.added.map((m) => m.role)).toEqual(["user"]);
  });

  it("answers the pending calls and runs no tool when aborted during the model call, or the conversation is left invalid", async () => {
    const ac = new AbortController();
    const { input, toolCalls } = setup(
      [
        () => {
          ac.abort();
          return asks([call("a"), call("b")]);
        },
      ],
      { signal: ac.signal },
    );
    const out = await runTurn(input);
    expect(out.end).toBe("aborted");
    expect(toolCalls).toEqual([]);
    expect(resultsOf(out.added[2])).toEqual([
      "a:err:The turn ended before this tool ran: the turn was stopped.",
      "b:err:The turn ended before this tool ran: the turn was stopped.",
    ]);
    expectNoOrphanCalls(out.added);
  });

  it("stops before the next model call when aborted while tools ran, keeping their results", async () => {
    const ac = new AbortController();
    const { input, requests } = setup([asks([call("a")]), say("never")], {
      signal: ac.signal,
      tool: async () => {
        ac.abort();
        return { content: "rolled", isError: false };
      },
    });
    const out = await runTurn(input);
    expect(out.end).toBe("aborted");
    expect(requests).toHaveLength(1);
    expect(resultsOf(out.added[2])).toEqual(["a:ok:rolled"]);
  });

  it("ends aborted with what was added when callModel rejects with an AbortError, instead of throwing", async () => {
    const abortError = Object.assign(new Error("aborted"), { name: "AbortError" });
    const { input } = setup([asks([call("a")]), abortError]);
    const out = await runTurn(input);
    expect(out.end).toBe("aborted");
    expect(out.added.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(out.steps).toHaveLength(1);
  });

  it("ends aborted when callModel rejects with any error while the signal is aborted", async () => {
    const ac = new AbortController();
    const { input } = setup([() => {
      ac.abort();
      throw new Error("socket closed");
    }], { signal: ac.signal });
    expect((await runTurn(input)).end).toBe("aborted");
  });

  it("lets a provider error propagate, or a retryable failure is swallowed and the caller never retries", async () => {
    const boom = new Error("provider 503");
    const { input } = setup([boom]);
    await expect(runTurn(input)).rejects.toBe(boom);
  });
});

describe("events", () => {
  it("reports text deltas, tool start and end, and one step per model call, in order", async () => {
    const events: TurnEvent[] = [];
    const { input } = setup(
      [
        (r) => {
          r.onText?.("Let me ");
          r.onText?.("look.");
          return asks([call("a", "look", { where: "door" })]);
        },
        say("done"),
      ],
      { onEvent: (e) => events.push(e) },
    );
    await runTurn(input);
    expect(events.map((e) => e.type)).toEqual(["text", "text", "step", "tool_start", "tool_end", "step"]);
    expect(events[0]).toEqual({ type: "text", delta: "Let me " });
    expect(events[3]).toEqual({ type: "tool_start", id: "a", name: "look", input: { where: "door" } });
    expect(events[4]).toEqual({ type: "tool_end", id: "a", name: "look", isError: false });
  });

  it("reports an unknown tool as started and ended with an error", async () => {
    const events: TurnEvent[] = [];
    const { input } = setup([asks([call("a", "nope")]), say("ok")], { onEvent: (e) => events.push(e) });
    await runTurn(input);
    expect(events.filter((e) => e.type === "tool_end")).toEqual([{ type: "tool_end", id: "a", name: "nope", isError: true }]);
  });

  it("sends no tool_end for calls answered because the turn ended", async () => {
    const events: TurnEvent[] = [];
    const { input } = setup([asks([call("a")])], {
      onEvent: (e) => events.push(e),
      limits: { maxSteps: 1, maxOutputTokens: 100, tokenBudget: null },
    });
    await runTurn(input);
    expect(events.map((e) => e.type)).toEqual(["step"]);
  });

  it("finishes the turn when onEvent throws, or a broken listener costs the player their answer", async () => {
    const { input } = setup([asks([call("a")]), say("fine")], {
      onEvent: () => {
        throw new Error("listener bug");
      },
    });
    const out = await runTurn(input);
    expect(out.end).toBe("done");
    expect(out.text).toBe("fine");
  });
});

describe("totalTokens", () => {
  it("sums input, output and both cache counts, or cached prompts escape the budget", () => {
    expect(
      totalTokens([
        usage({ inputTokens: 1, outputTokens: 2, cacheReadTokens: 4, cacheWriteTokens: 8 }),
        usage({ inputTokens: 16, outputTokens: 32, cacheReadTokens: 64, cacheWriteTokens: 128 }),
      ]),
    ).toBe(255);
    expect(totalTokens([])).toBe(0);
  });
});

function visibleOf(m: AgentMessage): string {
  return m.blocks.map((b) => (b.type === "text" ? b.text : "")).join("");
}
