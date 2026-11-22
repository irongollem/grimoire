import { describe, expect, it } from "vitest";
import { npcStarterStatTemplate } from "./starterStats";

describe("NPC starter stat profiles", () => {
  it("prefers the novice priest profile over the broader priest cue", () => {
    expect(npcStarterStatTemplate("novice priest")).toBe("acolyte");
  });

  it("does not infer a mage from a word that only contains its letters", () => {
    expect(npcStarterStatTemplate("image maker")).toBe("commoner");
  });
});
