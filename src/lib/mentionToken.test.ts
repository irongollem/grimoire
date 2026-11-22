import { describe, expect, it } from "vitest";
import { includesMentionToken, mentionTokenPattern } from "./mentionToken";

describe("item mentions", () => {
  it("recognizes a selected item before sentence punctuation", () => {
    expect(includesMentionToken("Carry @Rope, then leave.", "Rope")).toBe(true);
  });

  it("does not treat a longer item name as a prefix match", () => {
    expect(includesMentionToken("Bring @Rope_of_Climbing.", "Rope")).toBe(false);
    expect("Bring @Rope_of_Climbing.".replace(mentionTokenPattern("Rope"), "$1rope")).toBe("Bring @Rope_of_Climbing.");
  });

  it("preserves punctuation surrounding an exact mention during replacement", () => {
    expect("Bring (@Rope)!".replace(mentionTokenPattern("Rope"), (_match, prefix: string) => `${prefix}Rope`))
      .toBe("Bring (Rope)!");
  });
});
