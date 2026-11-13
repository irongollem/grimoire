import { describe, expect, it } from "vitest";
import { paintMarkerCount } from "./paintQuota";

describe("paintMarkerCount", () => {
  it("counts a painting in a chapter's JSON and one escaped inside furniture props (a regex that sees only one shape misses a canvas)", () => {
    const chapter = JSON.stringify({ attrs: { illuminate: { steps: [{ type: "paint" }] } } });
    const furniture = JSON.stringify([{ props: { illuminate: JSON.stringify({ steps: [{ type: "paint" }] }) } }]);
    expect(paintMarkerCount(chapter)).toBe(1);
    expect(paintMarkerCount(furniture)).toBe(1);
    expect(paintMarkerCount(chapter + furniture)).toBe(2);
  });

  it("does not count other steps or text that merely says paint", () => {
    expect(paintMarkerCount(JSON.stringify({ steps: [{ type: "grade" }], text: "paint" }))).toBe(0);
  });
});
