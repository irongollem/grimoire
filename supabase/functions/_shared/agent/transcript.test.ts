import { describe, expect, it } from "vitest";
import { blocksOf, historyFrom, rowsFor, systemWithSummary } from "./transcript";
import type { AgentMessage, AgentUsage } from "./types";

const text = (t: string) => ({ type: "text", text: t });
const call = (id: string) => ({ type: "tool_call", id, name: "roll", input: { expression: "1d20" } });
const result = (callId: string) => ({ type: "tool_result", callId, content: "17", isError: false });

describe("historyFrom", () => {
  it("returns rows in seq order whatever order they arrive in", () => {
    const h = historyFrom(
      [
        { seq: 3, role: "user", blocks: [text("c")] },
        { seq: 1, role: "user", blocks: [text("a")] },
        { seq: 2, role: "assistant", blocks: [text("b")] },
      ],
      0,
    );
    expect(h.map((m) => m.blocks[0])).toEqual([text("a"), text("b"), text("c")]);
  });

  it("leaves out rows at or below the summary, keeping the one just above", () => {
    const h = historyFrom(
      [
        { seq: 1, role: "user", blocks: [text("old")] },
        { seq: 2, role: "assistant", blocks: [text("covered")] },
        { seq: 3, role: "user", blocks: [text("new")] },
      ],
      2,
    );
    expect(h).toEqual([{ role: "user", blocks: [text("new")] }]);
  });

  it("drops a block that is not one of the four shapes and keeps its neighbours", () => {
    const h = historyFrom(
      [
        {
          seq: 1,
          role: "assistant",
          blocks: [text("ok"), { type: "image", url: "x" }, { type: "text" }, { type: "tool_call", id: "a", name: "n", input: [] }, null],
        },
      ],
      0,
    );
    expect(h).toEqual([{ role: "assistant", blocks: [text("ok")] }]);
  });

  it("yields no message for a row whose blocks is not an array, or empties out", () => {
    expect(historyFrom([{ seq: 1, role: "user", blocks: "oops" }], 0)).toEqual([]);
    expect(historyFrom([{ seq: 1, role: "user", blocks: [{ type: "bogus" }] }], 0)).toEqual([]);
  });

  it("keeps an opaque block with its data intact", () => {
    const h = historyFrom([{ seq: 1, role: "assistant", blocks: [{ type: "opaque", provider: "openai", data: { a: 1 } }] }], 0);
    expect(h[0].blocks).toEqual([{ type: "opaque", provider: "openai", data: { a: 1 } }]);
  });

  it("drops a leading tool-result message whose call was cut away by the summary", () => {
    const h = historyFrom(
      [
        { seq: 1, role: "assistant", blocks: [call("a")] },
        { seq: 2, role: "user", blocks: [result("a")] },
        { seq: 3, role: "assistant", blocks: [text("done")] },
      ],
      1,
    );
    expect(h).toEqual([{ role: "assistant", blocks: [text("done")] }]);
  });

  it("keeps a tool-result message that still has its call in the history", () => {
    const h = historyFrom(
      [
        { seq: 1, role: "assistant", blocks: [call("a")] },
        { seq: 2, role: "user", blocks: [result("a")] },
      ],
      0,
    );
    expect(h).toHaveLength(2);
  });
});

const u = (over: Partial<AgentUsage> = {}): AgentUsage => ({
  provider: "p",
  model: "m",
  inputTokens: 1,
  outputTokens: 1,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  ...over,
});
const user = (t: string): AgentMessage => ({ role: "user", blocks: [{ type: "text", text: t }] });
const asst = (t: string): AgentMessage => ({ role: "assistant", blocks: [{ type: "text", text: t }] });

function sum(rows: ReturnType<typeof rowsFor>) {
  const s = { i: 0, o: 0, r: 0, w: 0 };
  for (const r of rows) {
    s.i += r.input_tokens ?? 0;
    s.o += r.output_tokens ?? 0;
    s.r += r.cache_read_tokens ?? 0;
    s.w += r.cache_write_tokens ?? 0;
  }
  return s;
}

describe("rowsFor", () => {
  const base = { sessionId: "s", userId: "u" };

  it("continues seq from lastSeq + 1, one row per message", () => {
    const rows = rowsFor({ ...base, lastSeq: 7, added: [user("a"), asst("b")], steps: [u()], toolSteps: [] });
    expect(rows.map((r) => [r.seq, r.role, r.session_id, r.user_id])).toEqual([
      [8, "user", "s", "u"],
      [9, "assistant", "s", "u"],
    ]);
  });

  it("gives the i-th assistant message the i-th step and the user message no usage", () => {
    const rows = rowsFor({
      ...base,
      lastSeq: 0,
      added: [user("a"), asst("b"), { role: "user", blocks: [{ type: "tool_result", callId: "x", content: "", isError: false }] }, asst("c")],
      steps: [u({ inputTokens: 10, model: "one" }), u({ inputTokens: 20, model: "two" })],
      toolSteps: [],
    });
    expect(rows.map((r) => r.input_tokens)).toEqual([null, 10, null, 20]);
    expect(rows[3].model).toBe("two");
    expect(rows[0].provider).toBeNull();
  });

  it("folds a trailing step that wrote no message into the last assistant row so no tokens are lost", () => {
    const steps = [u({ inputTokens: 10 }), u({ inputTokens: 20, outputTokens: 7, cacheReadTokens: 3, cacheWriteTokens: 2 }), u({ inputTokens: 5 })];
    const rows = rowsFor({ ...base, lastSeq: 0, added: [user("a"), asst("b"), { role: "user", blocks: [{ type: "tool_result", callId: "x", content: "", isError: false }] }, asst("c")], steps, toolSteps: [] });
    // outputs 1 + 7 + 1 = 9, inputs 10 + 20 + 5 = 35
    expect(sum(rows)).toEqual({ i: 35, o: 9, r: 3, w: 2 });
    expect(rows[3].input_tokens).toBe(25);
  });

  it("puts the tokens of a turn that wrote no assistant message on its last row", () => {
    const rows = rowsFor({ ...base, lastSeq: 0, added: [user("a")], steps: [u({ inputTokens: 40 })], toolSteps: [] });
    expect(rows[0].input_tokens).toBe(40);
  });

  it("leaves usage null on every row when there were no steps", () => {
    const rows = rowsFor({ ...base, lastSeq: 0, added: [user("a")], steps: [], toolSteps: [] });
    expect(rows[0].input_tokens).toBeNull();
  });
});

describe("rowsFor with tool usage", () => {
  const base = { sessionId: "s", userId: "u" };
  const toolMsg = (id: string): AgentMessage => ({ role: "user", blocks: [{ type: "tool_result", callId: id, content: "", isError: false }] });

  it("puts a tool's own tokens on its tool-result row and keeps the total, or the session total undercounts a character's speech", () => {
    const rows = rowsFor({
      ...base,
      lastSeq: 0,
      added: [user("a"), asst("b"), toolMsg("x"), asst("c")],
      steps: [u({ inputTokens: 10 }), u({ inputTokens: 20 })],
      toolSteps: [{ index: 2, usage: u({ inputTokens: 7, outputTokens: 4 }) }],
    });
    expect(rows[2].input_tokens).toBe(7);
    expect(sum(rows)).toEqual({ i: 37, o: 6, r: 0, w: 0 });
  });

  it("merges leftover narrator steps with tool usage when a turn wrote no assistant message, or one of them is lost", () => {
    const rows = rowsFor({
      ...base,
      lastSeq: 0,
      added: [user("a")],
      steps: [u({ inputTokens: 40 })],
      toolSteps: [{ index: 0, usage: u({ inputTokens: 3 }) }],
    });
    expect(sum(rows).i).toBe(43);
  });

  it("sums the usage of two tool-result messages separately, or a later round's tokens land on the wrong row", () => {
    const rows = rowsFor({
      ...base,
      lastSeq: 0,
      added: [user("a"), asst("b"), toolMsg("x"), asst("c"), toolMsg("y")],
      steps: [u({ inputTokens: 10 }), u({ inputTokens: 20 })],
      toolSteps: [
        { index: 2, usage: u({ inputTokens: 1 }) },
        { index: 2, usage: u({ inputTokens: 2 }) },
        { index: 4, usage: u({ inputTokens: 100 }) },
      ],
    });
    expect(rows.map((r) => r.input_tokens)).toEqual([null, 10, 3, 20, 100]);
    expect(sum(rows).i).toBe(133);
  });
});

describe("a tool result's lines in storage", () => {
  const line = { kind: "spoken", speaker: { id: null, name: "Brann" }, text: "Mind the step." };
  const stored = (extra: Record<string, unknown>) => [
    { blocks: blocksOf({ seq: 1, role: "user", blocks: [{ type: "tool_result", callId: "x", content: "ok", isError: false, ...extra }] }) },
  ];

  const deed = { kind: "acted", speaker: { id: null, name: "Brann" }, text: "Nods." };

  it("keeps a valid line, or the browser loses what a character said after a reload", () => {
    expect(stored({ lines: [line] })[0].blocks[0]).toMatchObject({ lines: [line] });
  });

  it("keeps the valid line when its neighbour is bad, or one bad entry costs the character both its deed and words", () => {
    const block = stored({ lines: [{ ...deed, kind: "shouted" }, line] })[0].blocks[0];
    expect(block).toMatchObject({ lines: [line] });
  });

  it("keeps a deed and words in the order they were stored", () => {
    expect(stored({ lines: [deed, line] })[0].blocks[0]).toMatchObject({ lines: [deed, line] });
  });

  it("ignores the old single-line field, since nothing writes it any more", () => {
    expect(stored({ line })[0].blocks[0]).not.toHaveProperty("lines");
  });

  it("drops a line with a blank speaker name but keeps the result, or one bad line breaks the replay", () => {
    const block = stored({ lines: [{ ...line, speaker: { id: null, name: "" } }] })[0].blocks[0];
    expect(block).toEqual({ type: "tool_result", callId: "x", content: "ok", isError: false });
  });

  it("drops a line whose speaker id is a number, or a bad id reaches a link in the browser", () => {
    const block = stored({ lines: [{ ...line, speaker: { id: 5, name: "Brann" } }] })[0].blocks[0];
    expect(block).not.toHaveProperty("lines");
  });

  it("drops a line of an unknown kind", () => {
    expect(stored({ lines: [{ ...line, kind: "shouted" }] })[0].blocks[0]).not.toHaveProperty("lines");
  });
});

describe("systemWithSummary", () => {
  const system = "You are the Dungeon Master.";

  it("returns the system text byte-identical when there is no summary", () => {
    expect(systemWithSummary(system, null)).toBe(system);
    expect(systemWithSummary(system, "  ")).toBe(system);
  });

  it("appends the summary under a heading and keeps the system text as an exact prefix", () => {
    const out = systemWithSummary(system, "The party reached the mill.");
    expect(out.startsWith(system)).toBe(true);
    expect(out).toContain("## The story so far");
    expect(out.endsWith("The party reached the mill.")).toBe(true);
  });
});

describe("the player's stored move", () => {
  it("survives a reload, or the page could not tell what was said from what was done", () => {
    const row = { seq: 1, role: "user" as const, blocks: [{ type: "text", text: "x", player: { kind: "do", text: "I listen." } }] };
    expect(blocksOf(row)).toEqual([{ type: "text", text: "x", player: { kind: "do", text: "I listen." } }]);
  });

  it("drops a move of an unknown kind and keeps the text the model needs", () => {
    const row = { seq: 1, role: "user" as const, blocks: [{ type: "text", text: "x", player: { kind: "sing", text: "la" } }] };
    expect(blocksOf(row)).toEqual([{ type: "text", text: "x" }]);
  });
});

describe("a tool result's kept-back sentences and addressees in storage", () => {
  const stored = (extra: Record<string, unknown>) =>
    blocksOf({ seq: 1, role: "user", blocks: [{ type: "tool_result", callId: "x", content: "ok", isError: false, ...extra }] })[0];
  const held = { speaker: { id: "n1", name: "Bren" }, text: "I know where it went.", to: "Cole" };

  it("keeps a valid kept-back sentence, or a character forgets what it wanted to say after a reload", () => {
    expect(stored({ withheld: [held] })).toMatchObject({ withheld: [held] });
  });

  it("keeps one that was meant for nobody in particular", () => {
    expect(stored({ withheld: [{ ...held, to: null }] })).toMatchObject({ withheld: [{ ...held, to: null }] });
  });

  it.each([
    ["no speaker id", { ...held, speaker: { id: null, name: "Bren" } }],
    ["a blank speaker name", { ...held, speaker: { id: "n1", name: "" } }],
    ["words that are not text", { ...held, text: 5 }],
    ["blank words", { ...held, text: "" }],
    ["a recipient that is neither a name nor null", { ...held, to: 7 }],
    ["no recipient field at all", { speaker: held.speaker, text: held.text }],
  ])("drops an entry with %s but keeps its neighbour, or one bad entry costs a character every sentence", (_why, bad) => {
    expect(stored({ withheld: [bad, held] })).toMatchObject({ withheld: [held] });
  });

  it("sets no field when none survives", () => {
    expect(stored({ withheld: [{ text: "x" }] })).not.toHaveProperty("withheld");
  });

  it("keeps who a line was said to, or the page loses it on reload, and drops one that is not a name", () => {
    const line = { kind: "spoken", speaker: { id: null, name: "Brann" }, text: "Hm." };
    expect(stored({ lines: [{ ...line, to: "Bren" }] })).toMatchObject({ lines: [{ ...line, to: "Bren" }] });
    expect(stored({ lines: [{ ...line, to: 4 }] })).toMatchObject({ lines: [line] });
    expect((stored({ lines: [{ ...line, to: 4 }] }) as { lines: object[] }).lines[0]).not.toHaveProperty("to");
  });
});
