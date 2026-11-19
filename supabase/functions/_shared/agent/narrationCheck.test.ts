import { describe, expect, it } from "vitest";
import {
  MAX_LINE_CHARS,
  MAX_LINES_SENT,
  MAX_SENTENCE_CHARS,
  MAX_SENTENCES_JUDGED,
  NARRATION_ADDS_MIN,
  narrationKept,
  splitSentences,
} from "./narrationCheck";
import type { JudgeRequest, JudgeResult } from "../typesafe";
import type { AgentLine } from "./types";

const line = (text: string, kind: AgentLine["kind"] = "spoken", name = "Honeycomb"): AgentLine => ({
  kind,
  speaker: { id: "id-1", name },
  text,
});

/** A judge that scores sentence i with `scores[i]`; a null score leaves that answer out. */
function judging(scores: Array<number | null>) {
  const requests: JudgeRequest[] = [];
  const judge = async (request: JudgeRequest): Promise<JudgeResult> => {
    requests.push(request);
    const answers: JudgeResult["answers"] = {};
    scores.forEach((noul, i) => {
      if (noul !== null) answers[`s${i}`] = { type: "noul", noul };
    });
    return { model: "jev-1", inputTokens: 10, answers };
  };
  return { judge, requests };
}

describe("splitSentences", () => {
  it("keeps a closing quote or bracket with the sentence it ends, so a quoted line is not cut off from its quote mark", () => {
    expect(splitSentences('She says "Go now." Then she leaves (quickly). Done!')).toEqual(['She says "Go now."', "Then she leaves (quickly).", "Done!"]);
  });

  it("leaves an ellipsis inside its sentence, so a trailing-off line is not split in two", () => {
    expect(splitSentences("The door... opens slowly. Cold air.")).toEqual(["The door... opens slowly.", "Cold air."]);
  });

  it("does not split inside a number", () => {
    expect(splitSentences("It weighs 17.5 pounds. Heavy.")).toEqual(["It weighs 17.5 pounds.", "Heavy."]);
  });

  it("keeps a trailing fragment with no terminator as a sentence, so the end of the text is not lost", () => {
    expect(splitSentences("The lamp gutters. Then darkness")).toEqual(["The lamp gutters.", "Then darkness"]);
  });

  it("treats a paragraph break as a sentence break and returns no empty sentences", () => {
    expect(splitSentences("No stop here\n\nNext paragraph.  \n")).toEqual(["No stop here", "Next paragraph."]);
    expect(splitSentences("  \n ")).toEqual([]);
  });

  it("keeps ?! together and a final ellipsis as the end of the sentence", () => {
    expect(splitSentences("Really?! Yes...")).toEqual(["Really?!", "Yes..."]);
  });
});

describe("splitSentences at a semicolon", () => {
  it("ends a clause at a semicolon, so a restated deed joined to a real detail is judged on its own", () => {
    expect(splitSentences("Cantor turns to you; the lamp gutters. Dark.")).toEqual(["Cantor turns to you;", "the lamp gutters.", "Dark."]);
  });

  it("leaves a semicolon with no space after it alone, so a token like a;b is not cut", () => {
    expect(splitSentences("The tag reads a;b here.")).toEqual(["The tag reads a;b here."]);
  });
});

describe("narrationKept across a semicolon", () => {
  const joined = "Cantor turns to you; the lamp gutters.";

  it("drops the restating clause and capitalises the one kept after it, so the page never starts mid-sentence", async () => {
    const j = judging([0.1, 0.95]);
    expect(await narrationKept({ lines: [line("Hi.")], narration: joined, judge: j.judge })).toBe("The lamp gutters.");
  });

  it("ends a kept clause with a full stop when what followed its semicolon was dropped", async () => {
    const j = judging([0.95, 0.1, 0.95]);
    expect(await narrationKept({ lines: [line("Hi.")], narration: "The lamp gutters; Cantor turns to you. Dark.", judge: j.judge })).toBe("The lamp gutters. Dark.");
  });

  it("leaves a clause after a kept semicolon in lower case, so only a cut is mended", async () => {
    const j = judging([0.95, 0.95, 0.1]);
    expect(await narrationKept({ lines: [line("Hi.")], narration: "The lamp gutters; the door creaks. Cantor waits.", judge: j.judge })).toBe("The lamp gutters; the door creaks.");
  });
});

describe("narrationKept", () => {
  const two = "The cedar door gives no sound. Honeycomb watches you, waiting.";

  it("returns exactly the sentences at or above the line, joined by one space, so a restated sentence is not shown", async () => {
    const j = judging([0.99, 0.19]);
    expect(await narrationKept({ lines: [line("Hi.")], narration: two, judge: j.judge })).toBe("The cedar door gives no sound.");
  });

  it("keeps a sentence at exactly the threshold and drops one just under, so the boundary is the one tuned", async () => {
    const j = judging([NARRATION_ADDS_MIN, NARRATION_ADDS_MIN - 0.01]);
    expect(await narrationKept({ lines: [line("Hi.")], narration: "A. B.", judge: j.judge })).toBe("A.");
  });

  it("returns the original text byte for byte when every sentence is kept, so paragraphs are not rewritten", async () => {
    const text = "One.\n\nTwo.   Three.";
    const j = judging([0.9, 0.9, 0.9]);
    expect(await narrationKept({ lines: [line("Hi.")], narration: text, judge: j.judge })).toBe(text);
  });

  it("returns an empty string when every sentence only restates", async () => {
    const j = judging([0.1, 0.2]);
    expect(await narrationKept({ lines: [line("Hi.")], narration: two, judge: j.judge })).toBe("");
  });

  it("keeps a sentence whose answer is missing and still drops the one that scored low", async () => {
    const j = judging([null, 0.1]);
    expect(await narrationKept({ lines: [line("Hi.")], narration: "A. B.", judge: j.judge })).toBe("A.");
  });

  it("judges only the first eight sentences and keeps the rest as they are", async () => {
    const text = Array.from({ length: MAX_SENTENCES_JUDGED + 2 }, (_, i) => `S${i}.`).join(" ");
    const j = judging(Array.from({ length: MAX_SENTENCES_JUDGED + 2 }, () => 0.01));
    const kept = await narrationKept({ lines: [line("Hi.")], narration: text, judge: j.judge });
    expect(Object.keys(j.requests[0].questions)).toHaveLength(MAX_SENTENCES_JUDGED);
    expect(kept).toBe("S8. S9.");
  });

  it("makes no call for blank narration, and none when there are no lines", async () => {
    const j = judging([0]);
    expect(await narrationKept({ lines: [line("Hi.")], narration: "  \n ", judge: j.judge })).toBe("");
    expect(await narrationKept({ lines: [], narration: "The door creaks.", judge: j.judge })).toBe("The door creaks.");
    expect(j.requests).toHaveLength(0);
  });

  it("lets a throwing judge reach the caller, so the caller can show the original instead of reading it as a no", async () => {
    const judge = async (): Promise<JudgeResult> => {
      throw new Error("down");
    };
    await expect(narrationKept({ lines: [line("Hi.")], narration: "x.", judge })).rejects.toThrow();
  });

  it("sends the newest twelve lines cut, said and did told apart, and one keyed question per cut sentence", async () => {
    const j = judging([1, 1]);
    const lines = Array.from({ length: MAX_LINES_SENT + 3 }, (_, i) => line(`L${i}-${"x".repeat(MAX_LINE_CHARS + 50)}`, i % 2 === 0 ? "spoken" : "acted"));
    await narrationKept({ lines, narration: `${"n".repeat(MAX_SENTENCE_CHARS + 100)}. Second.`, judge: j.judge });
    const state = j.requests[0].state as { lines: Array<{ who: string; kind: string; text: string }>; sentences: string[] };
    expect(state.lines).toHaveLength(MAX_LINES_SENT);
    expect(state.lines[0].text.startsWith("L3-")).toBe(true);
    expect(state.lines.every((l) => l.text.length === MAX_LINE_CHARS)).toBe(true);
    expect(state.lines[0]).toMatchObject({ who: "Honeycomb", kind: "did" });
    expect(state.lines[1].kind).toBe("said");
    expect(state.sentences[0]).toHaveLength(MAX_SENTENCE_CHARS);
    expect(Object.keys(j.requests[0].questions)).toEqual(["s0", "s1"]);
    expect(JSON.stringify(j.requests[0].questions.s1)).toContain("sentences[1]");
  });

  it("sends nothing of a line but who, kind and text, so a speaker's id never leaves", async () => {
    const j = judging([1]);
    await narrationKept({ lines: [{ ...line("Hi."), to: "everyone" }], narration: "x.", judge: j.judge });
    expect(JSON.stringify(j.requests[0].state)).not.toContain("id-1");
    expect(Object.keys((j.requests[0].state as { lines: object[] }).lines[0]).sort()).toEqual(["kind", "text", "who"]);
  });
});
