import { describe, expect, it } from "vitest";
import {
  MAX_LINE_CHARS,
  MAX_LINES_SENT,
  MAX_NARRATION_CHARS,
  NARRATION_ADDS,
  NARRATION_ADDS_MIN,
  narrationAdds,
} from "./narrationCheck";
import type { JudgeRequest, JudgeResult } from "../typesafe";
import type { AgentLine } from "./types";

const line = (text: string, kind: AgentLine["kind"] = "spoken", name = "Honeycomb"): AgentLine => ({
  kind,
  speaker: { id: "id-1", name },
  text,
});

function judging(noul: number | null) {
  const requests: JudgeRequest[] = [];
  const judge = async (request: JudgeRequest): Promise<JudgeResult> => {
    requests.push(request);
    return {
      model: "jev-1",
      inputTokens: 10,
      answers: noul === null ? {} : { [NARRATION_ADDS]: { type: "noul", noul } },
    };
  };
  return { judge, requests };
}

describe("narrationAdds", () => {
  it("shows narration at exactly the threshold and hides it just under, so the boundary is the one tuned", async () => {
    const at = judging(NARRATION_ADDS_MIN);
    expect(await narrationAdds({ lines: [line("Hi.")], narration: "Rain begins.", judge: at.judge })).toBe(true);
    const under = judging(NARRATION_ADDS_MIN - 0.01);
    expect(await narrationAdds({ lines: [line("Hi.")], narration: "Rain begins.", judge: under.judge })).toBe(false);
  });

  it("makes no call for empty or blank narration, and hides it", async () => {
    const j = judging(0.9);
    expect(await narrationAdds({ lines: [line("Hi.")], narration: "  \n ", judge: j.judge })).toBe(false);
    expect(j.requests).toHaveLength(0);
  });

  it("makes no call and shows the narration when there are no lines, since nothing can be restated", async () => {
    const j = judging(0);
    expect(await narrationAdds({ lines: [], narration: "The door creaks.", judge: j.judge })).toBe(true);
    expect(j.requests).toHaveLength(0);
  });

  it("throws when the answer is missing, so the caller can fail open instead of reading it as a no", async () => {
    const j = judging(null);
    await expect(narrationAdds({ lines: [line("Hi.")], narration: "x", judge: j.judge })).rejects.toThrow();
  });

  it("sends only the newest twelve lines, each cut, with said and did told apart, and the narration cut", async () => {
    const j = judging(1);
    const lines = Array.from({ length: MAX_LINES_SENT + 3 }, (_, i) => line(`L${i}-${"x".repeat(MAX_LINE_CHARS + 50)}`, i % 2 === 0 ? "spoken" : "acted"));
    await narrationAdds({ lines, narration: "n".repeat(MAX_NARRATION_CHARS + 100), judge: j.judge });
    const state = j.requests[0].state as { lines: Array<{ who: string; kind: string; text: string }>; narration: string };
    expect(state.lines).toHaveLength(MAX_LINES_SENT);
    expect(state.lines[0].text.startsWith("L3-")).toBe(true);
    expect(state.lines.every((l) => l.text.length === MAX_LINE_CHARS)).toBe(true);
    expect(state.lines[0]).toMatchObject({ who: "Honeycomb", kind: "did" });
    expect(state.lines[1].kind).toBe("said");
    expect(state.narration).toHaveLength(MAX_NARRATION_CHARS);
  });

  it("sends nothing of a line but who, kind and text, so a speaker's id never leaves", async () => {
    const j = judging(1);
    await narrationAdds({ lines: [{ ...line("Hi."), to: "everyone" }], narration: "x", judge: j.judge });
    expect(JSON.stringify(j.requests[0].state)).not.toContain("id-1");
    expect(Object.keys((j.requests[0].state as { lines: object[] }).lines[0]).sort()).toEqual(["kind", "text", "who"]);
  });
});
