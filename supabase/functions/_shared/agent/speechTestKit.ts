// Shared fixtures for the speech tests: a scripted model that records its requests, and the stored rows a speak or
// act call leaves behind. Test-only.
import type { StoredTurn } from "./transcript";
import type { AgentUsage, CallModel, ModelRequest, ModelStep } from "./types";

export const A = "11111111-1111-4111-8111-111111111111";
export const B = "22222222-2222-4222-8222-222222222222";
export const C = "33333333-3333-4333-8333-333333333333";
export const USAGE: AgentUsage = { provider: "p", model: "m", inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 };

export function step(text: string, stop: ModelStep["stop"] = "end"): ModelStep {
  return { blocks: [{ type: "text", text }], stop, usage: USAGE };
}

export function recorder(answers: string[]): { callModel: CallModel; requests: ModelRequest[] } {
  const requests: ModelRequest[] = [];
  return {
    requests,
    callModel: async (r) => {
      requests.push(r);
      return step(answers[requests.length - 1] ?? "ok");
    },
  };
}

/** A stored speak call and its result, as the loop writes them. */
export function spoke(seq: number, input: Record<string, unknown>, name: string, text: string, speakerId: string | null = null): StoredTurn[] {
  const kind = name === "act" ? "acted" : "spoken";
  return spokeLines(seq, input, name, [{ kind, text }], speakerId);
}

/** The same, for a result that carries several lines (a deed and words from one call). */
export function spokeLines(
  seq: number, input: Record<string, unknown>, name: string, lines: { kind: "spoken" | "acted"; text: string }[], speakerId: string | null = null,
): StoredTurn[] {
  const id = `call-${seq}`;
  return [
    { seq, role: "assistant", blocks: [{ type: "tool_call", id, name, input }] },
    {
      seq: seq + 1, role: "user",
      blocks: [{
        type: "tool_result", callId: id, content: "x", isError: false,
        lines: lines.map((l) => ({ ...l, speaker: { id: speakerId, name: String(input.speaker_name ?? "Mira") } })),
      }],
    },
  ];
}

/**
 * A scripted model that answers by who is being played, so the order the calls arrive in does not matter. A
 * character with nothing left in its script stays silent.
 */
export function byCharacter(script: Record<string, string[]>): { callModel: CallModel; requests: ModelRequest[]; asked: string[] } {
  const requests: ModelRequest[] = [];
  const asked: string[] = [];
  return {
    requests,
    asked,
    callModel: async (r) => {
      requests.push(r);
      const name = /playing one character, ([^,]+),/.exec(r.system)?.[1] ?? "nobody";
      asked.push(name);
      return step(script[name]?.shift() ?? "DOES: -\nSAYS: -");
    },
  };
}

/** Three people with records: Alda (A, holds a secret), Bren (B) and Cole (C). */
export const ALDA_SECRET = "ALDA-SECRET-RECORD";
export const cast = async (id: string) => {
  if (id === A) return { id: A, shownName: "Alda", profile: `Name: Alda\nNotes: ${ALDA_SECRET}`, memories: "" };
  if (id === B) return { id: B, shownName: "Bren", profile: "Name: Bren", memories: "" };
  if (id === C) return { id: C, shownName: "Cole", profile: "Name: Cole", memories: "" };
  return null;
};
