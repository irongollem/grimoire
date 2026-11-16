import { describe, expect, it } from "vitest";
import { historyFrom, rowsFor, systemWithSummary } from "./transcript";
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
    const rows = rowsFor({ ...base, lastSeq: 7, added: [user("a"), asst("b")], steps: [u()] });
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
    });
    expect(rows.map((r) => r.input_tokens)).toEqual([null, 10, null, 20]);
    expect(rows[3].model).toBe("two");
    expect(rows[0].provider).toBeNull();
  });

  it("folds a trailing step that wrote no message into the last assistant row so no tokens are lost", () => {
    const steps = [u({ inputTokens: 10 }), u({ inputTokens: 20, outputTokens: 7, cacheReadTokens: 3, cacheWriteTokens: 2 }), u({ inputTokens: 5 })];
    const rows = rowsFor({ ...base, lastSeq: 0, added: [user("a"), asst("b"), { role: "user", blocks: [{ type: "tool_result", callId: "x", content: "", isError: false }] }, asst("c")], steps });
    // outputs 1 + 7 + 1 = 9, inputs 10 + 20 + 5 = 35
    expect(sum(rows)).toEqual({ i: 35, o: 9, r: 3, w: 2 });
    expect(rows[3].input_tokens).toBe(25);
  });

  it("puts the tokens of a turn that wrote no assistant message on its last row", () => {
    const rows = rowsFor({ ...base, lastSeq: 0, added: [user("a")], steps: [u({ inputTokens: 40 })] });
    expect(rows[0].input_tokens).toBe(40);
  });

  it("leaves usage null on every row when there were no steps", () => {
    const rows = rowsFor({ ...base, lastSeq: 0, added: [user("a")], steps: [] });
    expect(rows[0].input_tokens).toBeNull();
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
