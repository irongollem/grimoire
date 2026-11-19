import { describe, expect, it } from "vitest";
import { readingState } from "./noteReading";

describe("readingState", () => {
  // Bug caught: a note edited after it was read aloud still offered as its reading (the players hear the old
  // text as the new), or a note read a moment ago already called out of date.
  it("says a reading is of an earlier version only when the note changed after it", () => {
    const at = "2026-11-19T10:00:00.000Z";
    expect(readingState({ reading_hash: "h", reading_at: at, updated_at: at })).toBe("current");
    expect(readingState({ reading_hash: "h", reading_at: at, updated_at: "2026-11-19T10:00:00.001Z" })).toBe("earlier");
    expect(readingState({ reading_hash: null, reading_at: null, updated_at: at })).toBe("none");
    expect(readingState({ updated_at: at })).toBe("none");
  });
});
