import { describe, expect, it } from "vitest";
import { parseVoiceLines } from "./npcVoiceLines";

describe("parseVoiceLines", () => {
  it("reads an absent reveals as false (an older deploy must not flag every line or crash)", () => {
    expect(parseVoiceLines([{ text: "Hello." }, "Bare line."])).toEqual([
      { text: "Hello.", reveals: false },
      { text: "Bare line.", reveals: false },
    ]);
  });
  it("keeps reveals: true only for a literal true (a truthy string must not raise the caution)", () => {
    expect(parseVoiceLines([{ text: "a", reveals: true }, { text: "b", reveals: "yes" }, { text: "c", reveals: false }])).toEqual([
      { text: "a", reveals: true },
      { text: "b", reveals: false },
      { text: "c", reveals: false },
    ]);
  });
  it("drops blank and malformed entries and caps at three, keeping each flag with its own line", () => {
    const lines = parseVoiceLines([{ text: "  " }, 5, null, { text: "one", reveals: true }, "two", "three", "four"]);
    expect(lines).toEqual([
      { text: "one", reveals: true },
      { text: "two", reveals: false },
      { text: "three", reveals: false },
    ]);
  });
  it("returns nothing for a non-array reply", () => {
    expect(parseVoiceLines({ lines: [] })).toEqual([]);
  });
});
