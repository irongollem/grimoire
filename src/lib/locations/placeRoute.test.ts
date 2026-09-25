import { describe, it, expect } from "vitest";
import { placeRoute } from "./placeRoute";

describe("placeRoute", () => {
  it("opens the place selected in the Atlas", () => {
    expect(placeRoute("abc")).toBe("/locations?at=abc");
  });

  it("opens it in a working state when asked", () => {
    expect(placeRoute("abc", "edit")).toBe("/locations?at=abc&edit=true");
    expect(placeRoute("abc", "build")).toBe("/locations?at=abc&build=true");
    expect(placeRoute("abc", "run")).toBe("/locations?at=abc&run=true");
  });
});
