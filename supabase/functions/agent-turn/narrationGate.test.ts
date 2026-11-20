import { describe, expect, it } from "vitest";
import { narrationGate } from "./narration";
import type { AgentEvent } from "./turnTypes";
import type { AgentLine } from "../_shared/agent/types";

const line = (name: string, text: string): AgentLine => ({ kind: "spoken", speaker: { id: null, name }, text });

function gateWith(judged: boolean) {
  const events: AgentEvent[] = [];
  const gate = narrationGate({ judge: judged ? { keep: async (_lines: unknown, narration: string) => narration } as never : null, emit: (event) => events.push(event) });
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
