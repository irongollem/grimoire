import { describe, expect, it } from "vitest";
import { npcBlockedCaption } from "@/composables/openBook/useNpcBookRule";

describe("npcBlockedCaption", () => {
  it("is empty when nothing blocks", () => {
    expect(npcBlockedCaption(null)).toBeNull();
  });
  it("asks for the name first", () => {
    expect(npcBlockedCaption("name")).toBe("Share their name first: the book names everyone in it.");
  });
  it("leaves the whole-party caption to the control", () => {
    expect(npcBlockedCaption("party")).toBeNull();
  });
});
