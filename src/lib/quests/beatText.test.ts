import { describe, expect, it } from "vitest";
import { toTiptapJson } from "@/lib/tiptap/markdownToTiptap";
import { firstBeatText, hasBeatText } from "./beatText";

const BLANK = '{"type":"doc","content":[{"type":"paragraph"}]}';

describe("hasBeatText", () => {
  it("is false for null, whitespace and an emptied editor's blank doc (#1115)", () => {
    expect(hasBeatText(null)).toBe(false);
    expect(hasBeatText("  ")).toBe(false);
    expect(hasBeatText(BLANK)).toBe(false);
  });
  it("is true for legacy plain text and for a doc with words", () => {
    expect(hasBeatText("old rumour")).toBe(true);
    expect(hasBeatText(toTiptapJson("new rumour"))).toBe(true);
  });
});

describe("firstBeatText", () => {
  it("skips a blank rumour doc and falls through to the next value with words", () => {
    const lead = toTiptapJson("DM lead");
    expect(firstBeatText(null, BLANK, lead)).toBe(lead);
  });
  it("returns null when every value is blank", () => {
    expect(firstBeatText(null, BLANK, "")).toBeNull();
  });
});
