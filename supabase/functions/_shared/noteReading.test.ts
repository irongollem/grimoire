import { describe, expect, it } from "vitest";
import { CLOSING_CUE, joinAudio, noteSpeechText, READING_PIECE_CHARS, readingHash, readingKey, speechPieces, STORYTELLER_CUE, storytellerPieces } from "./noteReading";

const doc = (content: unknown[]) => JSON.stringify({ type: "doc", content });
const p = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });

describe("noteSpeechText", () => {
  // Bug caught: a heading run into the paragraph under it ("Session twelve The party reached..."), which a voice
  // reads as one breathless sentence.
  it("speaks a heading as a line of its own and keeps paragraphs apart", () => {
    const text = noteSpeechText(doc([{ type: "heading", content: [{ type: "text", text: "Session twelve" }] }, p("The party reached Sugarwell."), p("They went at dusk.")]));
    expect(text).toBe("Session twelve.\nThe party reached Sugarwell.\nThey went at dusk.");
  });

  // Bug caught: a list or a quote dropped from the reading because only top-level paragraphs were read, or a
  // picture's attributes read out as words.
  it("reads what is inside lists and quotes, and nothing of a picture", () => {
    const text = noteSpeechText(doc([
      { type: "image", attrs: { src: "https://example.invalid/a.png", alt: "a map" } },
      { type: "bulletList", content: [{ type: "listItem", content: [p("A boot print.")] }, { type: "listItem", content: [p("A missing key.")] }] },
      { type: "blockquote", content: [p("Answer enough.")] },
    ]));
    expect(text).toBe("A boot print.\nA missing key.\nAnswer enough.");
  });

  it("speaks an old plain-text note as it is, and nothing of text that cannot be read", () => {
    expect(noteSpeechText("Just  a line.")).toBe("Just a line.");
    expect(noteSpeechText("{not json")).toBe("");
    expect(noteSpeechText(null)).toBe("");
  });
});

describe("speechPieces", () => {
  // Bug caught: a note cut mid-word at the service's limit, or a piece past the limit that the service refuses
  // (the whole reading then fails after some of it was paid for).
  it("cuts between paragraphs, keeps every piece within the limit, and loses no words", () => {
    const paragraphs = Array.from({ length: 12 }, (_, i) => `Paragraph ${i} ${"word ".repeat(60)}end.`);
    const pieces = speechPieces(paragraphs.join("\n"));
    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces.every((piece) => piece.length <= READING_PIECE_CHARS)).toBe(true);
    expect(pieces.join("\n").split("\n")).toEqual(paragraphs);
  });

  it("cuts a paragraph longer than a piece between sentences, and a sentence longer still between words", () => {
    const long = `${"A sentence of some length. ".repeat(80)}`.trim();
    const pieces = speechPieces(long, 200);
    expect(pieces.every((piece) => piece.length <= 200)).toBe(true);
    expect(pieces.every((piece) => piece.endsWith("."))).toBe(true);
    const endless = "word ".repeat(100).trim();
    expect(speechPieces(endless, 50).join(" ").replace(/\n/g, " ")).toBe(endless);
  });
});

describe("where a reading is kept", () => {
  // Bug caught: two voices of one note sharing a recording, or a changed note answering with the old audio.
  it("names a recording by the text and the voice", async () => {
    const a = await readingHash("The party reached Sugarwell.", "male");
    expect(await readingHash("The party reached Sugarwell.", "male")).toBe(a);
    expect(await readingHash("The party reached Sugarwell.", "female")).not.toBe(a);
    expect(await readingHash("The party left Sugarwell.", "male")).not.toBe(a);
    expect(readingKey({ campaignId: "c1", noteId: "n1", hash: a })).toBe(`note-readings/c1/n1/${a}.mp3`);
  });

  it("joins pieces end to end", () => {
    expect([...joinAudio([new Uint8Array([1, 2]), new Uint8Array([3])])]).toEqual([1, 2, 3]);
  });
});

describe("storytellerPieces", () => {
  // Bug caught: only the first piece cued, so a long note changes voice after its first minute; or the Dungeon
  // Master's own "[the door is locked]" taken for a cue and never spoken.
  it("cues every piece the same way, closes on the last paragraph, and keeps the note's own brackets as words", () => {
    const pieces = storytellerPieces(["They went at dusk.\nThe lock was whole.", "A note said [keep out].\nWho took the key?"]);
    expect(pieces[0]).toBe(`[${STORYTELLER_CUE}] They went at dusk.\nThe lock was whole.`);
    expect(pieces[1]).toBe(`[${STORYTELLER_CUE}] A note said (keep out).\n[${CLOSING_CUE}] Who took the key?`);
    expect(storytellerPieces(["One line."])).toEqual([`[${STORYTELLER_CUE}] [${CLOSING_CUE}] One line.`]);
  });
});
