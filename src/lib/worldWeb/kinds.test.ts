import { describe, expect, it } from "vitest";
import { dmSheetPath, parseNodeKey, playerListPath } from "./kinds";

describe("canon nodes", () => {
  it("opens a canon entry on the Canon page and a player on their world tab", () => {
    expect(dmSheetPath({ kind: "canon", id: "c1" })).toBe("/canon?entry=c1");
    expect(playerListPath("canon")).toBe("/play/journal?tab=world");
  });

  it("reads a canon node key back, so the web can draw one", () => {
    expect(parseNodeKey("canon:c1")).toEqual({ kind: "canon", id: "c1" });
  });
});
