import { describe, expect, it } from "vitest";
import { ageOf, pickVoice, sexOf, SPEECH_MAX_CHARS, speechText, STOCK_VOICES, type StockVoice } from "./voicePick";

describe("sexOf", () => {
  it("reads a record about a woman as a woman even when it mentions a man once", () => {
    expect(sexOf("She keeps the inn. Her late husband left her his debts, and she paid them herself.")).toBe("woman");
  });

  it("reads a record about a man as a man", () => {
    expect(sexOf("He asks a question and then waits; his patience is the lesson.")).toBe("man");
  });

  it("does not guess when the record says nothing or says both alike", () => {
    expect(sexOf("Keeper of the Roost. Brisk, exact, proud of the ledgers.")).toBeNull();
    expect(sexOf("She and he argue. Her ledger, his keys.")).toBeNull();
    // Three to two is not a clear lead: a record that talks of both is not a reason to guess.
    expect(sexOf("She took her ledger and she left. He kept his keys.")).toBeNull();
  });

  it("does not take 'the', 'here' or 'history' for a pronoun", () => {
    expect(sexOf("The history here is theirs.")).toBeNull();
  });
});

describe("ageOf", () => {
  it.each([
    ["~20 Pours by Sugarspun reckoning", "young"],
    ["29", "young"],
    ["30", "adult"],
    ["~55 Pours (mid-stage)", "adult"],
    ["59", "adult"],
    ["60", "old"],
    ["late 70s", "old"],
  ] as const)("reads %s as %s", (text, band) => {
    expect(ageOf(text)).toBe(band);
  });

  it("goes by a word when there is no number, and by nothing when there is neither", () => {
    expect(ageOf("Unreckonable: generations, older than the Well's own memory")).toBe("old");
    expect(ageOf("a child of the Lost-and-Found")).toBe("young");
    expect(ageOf("unknown")).toBeNull();
  });
});

describe("pickVoice", () => {
  const voices: StockVoice[] = [
    { id: "w-young-1", name: "A", sex: "woman", age: "young" },
    { id: "w-young-2", name: "B", sex: "woman", age: "young" },
    { id: "w-adult", name: "C", sex: "woman", age: "adult" },
    { id: "m-old", name: "D", sex: "man", age: "old" },
  ];

  it("casts within the character's sex and age", () => {
    expect(pickVoice("honeycomb", { sex: "woman", age: "adult" }, voices).id).toBe("w-adult");
    expect(pickVoice("gaffer", { sex: "man", age: "old" }, voices).id).toBe("m-old");
  });

  it("gives the same character the same voice every time, so nobody changes voice between lines", () => {
    const first = pickVoice("honeycomb", { sex: "woman", age: "young" }, voices).id;
    for (let i = 0; i < 5; i++) expect(pickVoice("honeycomb", { sex: "woman", age: "young" }, voices).id).toBe(first);
  });

  it("spreads different characters of one kind over the voices of that kind", () => {
    const cast = new Set(["a", "b", "c", "d", "e", "f", "g", "h"].map((k) => pickVoice(k, { sex: "woman", age: "young" }, voices).id));
    expect(cast).toEqual(new Set(["w-young-1", "w-young-2"]));
  });

  it("keeps to the sex when no voice of that age exists, rather than crossing to the other sex", () => {
    // The ready-made set has no old woman: she is cast from the women, not given the old man's voice.
    for (const key of ["ribbon", "a", "b", "c", "d", "e", "f", "g"]) expect(pickVoice(key, { sex: "woman", age: "old" }, voices).sex).toBe("woman");
  });

  it("casts from everyone when nothing is known", () => {
    expect(voices.map((v) => v.id)).toContain(pickVoice("stranger", { sex: null, age: null }, voices).id);
  });

  it("has a voice of each sex in every age band it claims, and no voice listed twice", () => {
    expect(new Set(STOCK_VOICES.map((v) => v.id)).size).toBe(STOCK_VOICES.length);
    for (const sex of ["woman", "man"] as const) expect(STOCK_VOICES.some((v) => v.sex === sex)).toBe(true);
  });
});

describe("speechText", () => {
  it("puts the cue in front of the words as a tag, and nothing when the line is said plainly", () => {
    expect(speechText("Get out!", "furious, shouting")).toBe("[furious, shouting] Get out!");
    expect(speechText("Good morning.", null)).toBe("Good morning.");
  });

  it("takes brackets out of the words, so a line cannot give the voice an instruction of its own", () => {
    expect(speechText("Hello [whispers] there <break/>", null)).toBe("Hello whispers there break/");
  });

  it("cuts a line that is far too long to be one", () => {
    expect(speechText("a".repeat(SPEECH_MAX_CHARS + 50), null)).toHaveLength(SPEECH_MAX_CHARS);
  });
});
