import { describe, expect, it } from "vitest";
import { toldText } from "./toldText";

describe("toldText", () => {
  it("reads markup as text and drops blanks", () => {
    expect(toldText("<p>Owes <strong>Wren</strong> a debt</p>")).toBe("Owes Wren a debt");
    expect(toldText("<p></p>")).toBeNull();
    expect(toldText("  ")).toBeNull();
    expect(toldText(null)).toBeNull();
    expect(toldText("plain")).toBe("plain");
  });
  it("does not execute markup", () => {
    expect(toldText("<img src=x onerror=alert(1)>hi")).toBe("hi");
  });
});
