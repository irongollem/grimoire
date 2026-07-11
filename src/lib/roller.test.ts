import { describe, it, expect } from "vitest";
import { combineModes } from "./roller";

describe("combineModes", () => {
  it("returns the other mode when one side is normal", () => {
    expect(combineModes("normal", "normal")).toBe("normal");
    expect(combineModes("advantage", "normal")).toBe("advantage");
    expect(combineModes("normal", "advantage")).toBe("advantage");
    expect(combineModes("disadvantage", "normal")).toBe("disadvantage");
    expect(combineModes("normal", "disadvantage")).toBe("disadvantage");
  });

  it("keeps the mode when both sides agree", () => {
    expect(combineModes("advantage", "advantage")).toBe("advantage");
    expect(combineModes("disadvantage", "disadvantage")).toBe("disadvantage");
  });

  it("cancels to normal when advantage meets disadvantage (5e RAW)", () => {
    expect(combineModes("advantage", "disadvantage")).toBe("normal");
    expect(combineModes("disadvantage", "advantage")).toBe("normal");
  });
});
