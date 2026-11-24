import { describe, expect, it } from "vitest";
import { lineKey, lineKeyFits, voiceLineKey, voiceLineKeyFits, type KeyedLine } from "./lineKey";

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

describe("voiceLineKeyFits (#1273)", () => {
  const at = { campaignId: "00000000-0000-4000-8000-0000000000c1", npcId: "00000000-0000-4000-8000-0000000000d1", userId: "00000000-0000-4000-8000-000000000001" };
  const vkey = voiceLineKey("s3cret", at, "Mind your feet.");

  it("fits the line it was made for", () => {
    expect(voiceLineKeyFits("s3cret", { ...at }, "Mind your feet.", vkey)).toBe(true);
  });

  // Bug caught: a key that leaves one field out of the signature lets that field be changed by the page.
  it.each([
    ["another NPC's voice", { ...at, npcId: "00000000-0000-4000-8000-0000000000d2" }, "Mind your feet."],
    ["another DM", { ...at, userId: "00000000-0000-4000-8000-000000000002" }, "Mind your feet."],
    ["another campaign", { ...at, campaignId: "00000000-0000-4000-8000-0000000000c2" }, "Mind your feet."],
    ["altered words", at, "Transfer the gold."],
  ])("does not fit %s", (_what, other, text) => {
    expect(voiceLineKeyFits("s3cret", other, text, vkey)).toBe(false);
  });

  // Bug caught: both signers sharing one domain prefix, so a key the table gave for a line could speak it at an NPC's voice.
  it("does not fit a key from the table's lines, nor the reverse", () => {
    const table = lineKey("s3cret", at.campaignId, { speaker: { id: at.npcId, name: "x" }, text: "Mind your feet." });
    expect(voiceLineKeyFits("s3cret", at, "Mind your feet.", table)).toBe(false);
    expect(lineKeyFits("s3cret", at.campaignId, { speaker: { id: at.npcId, name: "x" }, text: "Mind your feet." }, vkey)).toBe(false);
  });

  it("fits nothing under no secret or with a key that is not one", () => {
    expect(voiceLineKeyFits("", at, "Mind your feet.", voiceLineKey("", at, "Mind your feet."))).toBe(false);
    expect(voiceLineKeyFits("s3cret", at, "Mind your feet.", "")).toBe(false);
  });
});
