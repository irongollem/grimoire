import { describe, expect, it } from "vitest";
import { directionLabel } from "./sortOptions";

describe("directionLabel", () => {
  it("says each kind of order in its own words", () => {
    expect(directionLabel({ value: "c", label: "Created", order: "date" }, "desc")).toBe("Newest first");
    expect(directionLabel({ value: "t", label: "Title", order: "text" }, "asc")).toBe("A to Z");
    expect(directionLabel({ value: "r", label: "Rating", order: "number" }, "desc")).toBe("Highest first");
  });

  it("prefers a field's own words, and has none for a fixed order", () => {
    const length = { value: "l", label: "Length", order: "number", directions: { asc: "Shortest first", desc: "Longest first" } } as const;
    expect(directionLabel(length, "asc")).toBe("Shortest first");
    expect(directionLabel({ value: "m", label: "Manual", order: "fixed" }, "asc")).toBeNull();
  });
});
