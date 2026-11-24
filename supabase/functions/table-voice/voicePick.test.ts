import { describe, expect, it } from "vitest";
import { sexFromGender, ageOf, sexOf, SPEECH_MAX_CHARS, speechText } from "./voicePick";

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
    ["7", "child"],
    ["12", "child"],
    ["13", "young"],
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
    // Bug caught: a child cast as an adult, since the bands began at "young".
    expect(ageOf("a child of the Lost-and-Found")).toBe("child");
    expect(ageOf("the baker's boy")).toBe("child");
    expect(ageOf("a young smith")).toBe("young");
    // "little" says small, but a little old man is old.
    expect(ageOf("a little old man")).toBe("old");
    expect(ageOf("unknown")).toBeNull();
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

describe("sexFromGender", () => {
  // Bug caught: "Female" read as a man because it contains "male".
  it("reads the sheet's word and nothing else", () => {
    expect(sexFromGender("Female")).toBe("woman");
    expect(sexFromGender(" male ")).toBe("man");
    expect(sexFromGender("Nonbinary")).toBeNull();
    expect(sexFromGender("")).toBeNull();
  });
});
