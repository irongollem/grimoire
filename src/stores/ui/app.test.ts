import { describe, it, expect } from "vitest";
import { readUserMode } from "./app";

describe("readUserMode", () => {
  it("keeps the two modes the app writes", () => {
    expect(readUserMode("dm")).toBe("dm");
    expect(readUserMode("player")).toBe("player");
  });

  // A value the app never writes must not read as a mode, or the lens fence
  // (which acts only on a known mode) stands down while the DM shell renders.
  it("reads anything else as never chosen", () => {
    expect(readUserMode("")).toBe("");
    expect(readUserMode('"dm"')).toBe("");
    expect(readUserMode("DM")).toBe("");
  });
});
