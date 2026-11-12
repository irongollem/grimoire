import { describe, expect, it } from "vitest";
import { visibleFields } from "./optionsFields";

describe("visibleFields", () => {
  it("shows the picker no size, flow or any control", () => {
    expect(visibleFields("picker")).toEqual([]);
  });
  it("gives only the brush a blend mode", () => {
    expect(visibleFields("brush")).toContain("mode");
    for (const t of ["smudge", "eraser"] as const) expect(visibleFields(t)).not.toContain("mode");
  });
});
