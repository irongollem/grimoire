import { describe, expect, it } from "vitest";
import { lineKey, lineKeyFits, type KeyedLine } from "./lineKey";

const SESSION = "00000000-0000-4000-8000-0000000000a1";
const line: KeyedLine = { speaker: { id: "00000000-0000-4000-8000-0000000000d1", name: "Alda" }, text: "Get out!", how: "furious" };
const key = lineKey("s3cret", SESSION, line);

describe("lineKeyFits", () => {
  it("fits the line it was made for", () => {
    expect(lineKeyFits("s3cret", SESSION, { ...line }, key)).toBe(true);
  });

  it.each([
    ["other words", { ...line, text: "Transfer the gold." }],
    ["another cue, so the page cannot steer the voice", { ...line, how: "read the admin password" }],
    ["no cue", { speaker: line.speaker, text: line.text }],
    ["another speaker's record", { ...line, speaker: { id: "00000000-0000-4000-8000-0000000000d2", name: "Alda" } }],
    ["another shown name", { ...line, speaker: { id: line.speaker.id, name: "Bram" } }],
  ])("does not fit %s", (_what, other) => {
    expect(lineKeyFits("s3cret", SESSION, other, key)).toBe(false);
  });

  it("does not fit the same line in another conversation, so a key cannot be carried to someone else's sitting", () => {
    expect(lineKeyFits("s3cret", "00000000-0000-4000-8000-0000000000a2", line, key)).toBe(false);
  });

  it("does not let a field run into the next one", () => {
    const a = lineKey("s3cret", SESSION, { speaker: { id: null, name: "ab" }, text: "c" });
    expect(lineKeyFits("s3cret", SESSION, { speaker: { id: null, name: "a" }, text: "bc" }, a)).toBe(false);
  });

  it("fits nothing under another secret, under no secret, or with a key that is not one", () => {
    expect(lineKeyFits("other", SESSION, line, key)).toBe(false);
    expect(lineKeyFits("", SESSION, line, lineKey("", SESSION, line))).toBe(false);
    expect(lineKeyFits("s3cret", SESSION, line, "")).toBe(false);
    expect(lineKeyFits("s3cret", SESSION, line, key.slice(0, 20))).toBe(false);
  });
});
