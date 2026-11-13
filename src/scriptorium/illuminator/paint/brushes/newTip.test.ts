import { describe, expect, it } from "vitest";
import { describedName } from "./newTip";

describe("describedName", () => {
  it("numbers the brush and shortens the words, never the number", () => {
    // Fails on: an 80-character cut that would take the digit and name all four brushes alike.
    expect(describedName("a wet sponge dab", 3)).toBe("a wet sponge dab 3");
    const long = describedName("x".repeat(200), 4);
    expect(long).toHaveLength(80);
    expect(long.endsWith(" 4")).toBe(true);
  });
});
