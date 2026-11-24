import { describe, expect, it } from "vitest";
import { restoredItems } from "./askRestore";

describe("restoredItems", () => {
  // Bug caught: a reply that called a tool between its words brought back as two replies (and Read again then
  // finding no clip, which was kept for the joined text), or a tool result shown as something the DM said.
  it("joins a reply across a tool call and leaves tool results out", () => {
    const turns = [
      { role: "user", blocks: [{ type: "text", text: "Who runs the inn?" }] },
      { role: "assistant", blocks: [{ type: "text", text: "Let me look. " }, { type: "tool_call", id: "c1", name: "read" }] },
      { role: "user", blocks: [{ type: "tool_result", callId: "c1", content: "{}" }] },
      { role: "assistant", blocks: [{ type: "text", text: "Harl runs it." }] },
    ];
    expect(restoredItems(turns)).toEqual([
      { kind: "user", text: "Who runs the inn?" },
      { kind: "reply", text: "Let me look. Harl runs it." },
    ]);
  });

  // Bug caught: words the DM was never shown (withheld) appearing after a reload.
  it("leaves out text that was never shown", () => {
    const turns = [
      { role: "user", blocks: [{ type: "text", text: "Hi" }] },
      { role: "assistant", blocks: [{ type: "text", text: "Hidden.", unshown: true }, { type: "text", text: "Hello." }] },
    ];
    expect(restoredItems(turns)).toEqual([{ kind: "user", text: "Hi" }, { kind: "reply", text: "Hello." }]);
  });

  // Bug caught: two questions' answers run together into one reply.
  it("ends a reply at the DM's next message", () => {
    const turns = [
      { role: "user", blocks: [{ type: "text", text: "One?" }] },
      { role: "assistant", blocks: [{ type: "text", text: "First." }] },
      { role: "user", blocks: [{ type: "text", text: "Two?" }] },
      { role: "assistant", blocks: [{ type: "text", text: "Second." }] },
    ];
    expect(restoredItems(turns).map((i) => i.text)).toEqual(["One?", "First.", "Two?", "Second."]);
  });
});
