import { describe, expect, it } from "vitest";
import { healthVisibilityOf } from "./healthVisibility";

describe("healthVisibilityOf", () => {
  it("fails closed while the campaign row has not arrived", () => {
    expect(healthVisibilityOf(null)).toBe("unknown");
  });

  it("returns the campaign's own setting once it is loaded", () => {
    expect(healthVisibilityOf({ health_visibility: "strategic" })).toBe("strategic");
    expect(healthVisibilityOf({ health_visibility: "immersive" })).toBe("immersive");
  });
});
