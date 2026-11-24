import { describe, expect, it, vi } from "vitest";
import type { JudgeRequest, JudgeResult } from "../typesafe";
import { candidateNames, NAME_CANDIDATES_MAX, nameCheckRequest, nameCore, namesJudged, unknownNames, unknownNamesHint, UNKNOWN_NAME_MIN } from "./nameCheck";

describe("candidateNames", () => {
  it.each([
    ["a sentence-initial word alone proves nothing", "Floss laughed. The door stood open.", []],
    ["a mid-sentence name is found", "You turn and see Floret by the well.", ["Floret"]],
    ["a name that also opens a sentence is found where it sits mid-sentence", "Floret laughed. Nobody had seen Floret since dawn.", ["Floret"]],
    ["a multi-word name with a connector", "The road leads to the Tower of the Moon and past Duke of Ashfield's gate.", ["Tower of the Moon", "Duke of Ashfield"]],
    ["a name that opens a sentence with a second capitalised word", "Floss Candlewick looked up from the counter.", ["Floss Candlewick"]],
    ["a word after an opening quote", 'He says, "Listen, friend." Then "Hello there," says Brant.', ["Brant"]],
    ["a leading stop word is stripped from a run", "Then Floss waved to them.", []],
    ["apostrophes and hyphens stay inside a name, a possessive does not", "You hear D'Arcy-Vane's boots on the stairs.", ["D'Arcy-Vane"]],
    ["pronouns, I, days and months are no names", "Last Tuesday in March, I think, They said He knew It was late.", []],
    ["a title alone is no name, with a name it is one", "You nod to the Master, who points at Master Floret.", ["Master Floret"]],
    ["a comma ends a run", "You meet Brant, Floret and Wren.", ["Brant", "Floret", "Wren"]],
  ])("%s", (_name, text, expected) => {
    expect(candidateNames(text)).toEqual(expected);
  });

  it("gives each name once however often it is used", () => {
    expect(candidateNames("You see Floret. Then you hear floret's name and Floret again, near Floret.")).toEqual(["Floret"]);
  });

  it("gives at most NAME_CANDIDATES_MAX names", () => {
    const text = "You pass " + Array.from({ length: 12 }, (_, i) => `Person${String.fromCharCode(65 + i)}`).join(", ") + ".";
    expect(candidateNames(text)).toHaveLength(NAME_CANDIDATES_MAX);
  });
});

describe("the judge's request and verdict", () => {
  const answers = (...noul: Array<number | null>): JudgeResult => ({
    model: "jev-1",
    inputTokens: 1,
    answers: Object.fromEntries(noul.map((n, i) => [`name_${i}`, n === null ? undefined : { type: "noul", noul: n }]).filter(([, v]) => v !== undefined)),
  });

  it("asks one question per name, naming it", () => {
    const request = nameCheckRequest({ narration: "You see Floret and Wren.", names: ["Floret", "Wren"] });
    expect(Object.keys(request.questions)).toEqual(["name_0", "name_1"]);
    expect(request.questions.name_1.instructions).toContain("Wren");
  });

  it("keeps a name at the threshold and not just under it, and reads a missing answer as no name", () => {
    expect(namesJudged(answers(UNKNOWN_NAME_MIN, UNKNOWN_NAME_MIN - 0.01, null), ["A", "B", "C"])).toEqual(["A"]);
  });

  it("words the hint for one name and for several", () => {
    expect(unknownNamesHint(["Floret"])).toContain("Floret, which the campaign has no record of");
    expect(unknownNamesHint(["A", "B", "C"])).toContain("A, B and C");
    expect(unknownNamesHint(["A"])).toContain("introduce");
  });
});

describe("unknownNames", () => {
  const narration = "You turn and see Floret by the well.";
  const yes = async (): Promise<JudgeResult> => ({ model: "jev-1", inputTokens: 1, answers: { name_0: { type: "noul", noul: 0.95 } } });
  const run = (over: Partial<Parameters<typeof unknownNames>[0]> = {}) =>
    unknownNames({ narration, known: async () => [], judge: yes, limitMs: 50, ...over });

  it("returns a name the campaign does not know and the judge says is one", async () => {
    expect(await run()).toEqual(["Floret"]);
  });

  it("drops a name the campaign knows, whatever the case, and then asks the judge nothing", async () => {
    const judge = vi.fn(yes);
    expect(await run({ known: async () => ["floret"], judge })).toEqual([]);
    expect(judge).not.toHaveBeenCalled();
  });

  it("asks the judge only about the names left", async () => {
    const requests: JudgeRequest[] = [];
    await run({
      narration: "You see Floret and Wren.",
      known: async () => ["Wren"],
      judge: async (r) => { requests.push(r); return yes(); },
    });
    expect(Object.keys(requests[0].questions)).toEqual(["name_0"]);
    expect(requests[0].questions.name_0.instructions).toContain("Floret");
  });

  it("returns nothing when the judge is below the threshold", async () => {
    expect(await run({ judge: async () => ({ model: "jev-1", inputTokens: 1, answers: { name_0: { type: "noul", noul: 0.5 } } }) })).toEqual([]);
  });

  it.each([
    ["no judge", { judge: null }],
    ["no narration", { narration: "  " }],
    ["no candidates in it", { narration: "The door stood open." }],
  ])("fails open with %s", async (_name, over) => {
    expect(await run(over)).toEqual([]);
  });

  it("reads nothing from the database when there is no judge to ask afterwards", async () => {
    const known = vi.fn(async () => []);
    expect(await run({ judge: null, known })).toEqual([]);
    expect(known).not.toHaveBeenCalled();
  });

  it("fails open, and says so without the story's words, when the judge throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(await run({ judge: async () => { throw new Error("down"); } })).toEqual([]);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(warn.mock.calls)).not.toContain("Floret");
    } finally {
      warn.mockRestore();
    }
  });

  it("fails open when the lookup throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(await run({ known: async () => { throw new Error("db down"); } })).toEqual([]);
    } finally {
      warn.mockRestore();
    }
  });

  it("fails open when lookup and judge together are slower than the limit, without waiting", async () => {
    vi.useFakeTimers();
    try {
      const pending = run({ known: () => new Promise<string[]>(() => {}), limitMs: 1_500 });
      await vi.advanceTimersByTimeAsync(1_501);
      expect(await pending).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});

// #1268 review: the hint sent every name to `introduce`, which makes a person, so a place became an NPC.
describe("unknownNamesHint for what is not a person", () => {
  it("sends a place, group or thing to record, and only a person or creature to introduce", () => {
    const hint = unknownNamesHint(["Saltmarsh Ferry"]);
    expect(hint).toContain("a person or creature a record with introduce");
    expect(hint).toContain("a place, group or thing on record with record");
  });
});

// #1268 review: "Lord Ashfield" was looked up whole, missed the record "Ashfield" and was hinted as unknown.
describe("nameCore", () => {
  it.each([
    ["Lord Ashfield", "Ashfield"],
    ["Old Mother Hollow", "Hollow"],
    ["Ashfield", "Ashfield"],
    // A title alone keeps itself: there is nothing else to look up.
    ["Captain", "Captain"],
    // A title inside the name is part of it.
    ["Ravi the Captain", "Ravi the Captain"],
  ])("%s is looked up as %s", (name, core) => {
    expect(nameCore(name)).toBe(core);
  });
});
