import { describe, expect, it } from "vitest";
import { sittingWho } from "./sittingLabel";

describe("who an earlier sitting was played as", () => {
  it("does not claim a character left the party when none was ever chosen", () => {
    expect(sittingWho(null, null)).toBe("No character chosen");
  });

  it("says a character has left when the sitting had one that the party no longer holds", () => {
    expect(sittingWho(null, "p1")).toBe("A character no longer in the party");
  });

  it("names the character when the party still has them", () => {
    expect(sittingWho("Rosie", "p1")).toBe("Rosie");
  });
});
