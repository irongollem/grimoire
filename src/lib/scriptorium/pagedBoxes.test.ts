// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { classifyLongBoxes, LONG_BOX_CHAR_THRESHOLD } from "./pagedBoxes";

function textOfLength(n: number): string {
  return "x".repeat(n);
}

describe("classifyLongBoxes", () => {
  it("returns the html unchanged when there is no note or descriptive box", () => {
    const html = "<p>Nothing boxed here.</p>";
    expect(classifyLongBoxes(html)).toBe(html);
  });

  it("leaves a short note box alone (no sc-box--long)", () => {
    const html = `<div class="sc-note"><p>${textOfLength(LONG_BOX_CHAR_THRESHOLD - 1)}</p></div>`;
    const out = classifyLongBoxes(html);
    expect(out).not.toContain("sc-box--long");
  });

  it("marks a note box past the threshold sc-box--long", () => {
    const html = `<div class="sc-note"><p>${textOfLength(LONG_BOX_CHAR_THRESHOLD + 1)}</p></div>`;
    const out = classifyLongBoxes(html);
    expect(out).toContain('class="sc-note sc-box--long"');
  });

  it("marks a read-aloud box past the threshold sc-box--long the same way", () => {
    const html = `<div class="sc-descriptive"><p>${textOfLength(LONG_BOX_CHAR_THRESHOLD + 1)}</p></div>`;
    const out = classifyLongBoxes(html);
    expect(out).toContain('class="sc-descriptive sc-box--long"');
  });

  it("classifies each box independently", () => {
    const html =
      `<div class="sc-note"><p>${textOfLength(50)}</p></div>` +
      `<div class="sc-descriptive"><p>${textOfLength(LONG_BOX_CHAR_THRESHOLD + 200)}</p></div>`;
    const out = classifyLongBoxes(html);
    const root = document.createElement("div");
    root.innerHTML = out;
    const boxes = Array.from(root.querySelectorAll(".sc-note, .sc-descriptive"));
    expect(boxes[0].classList.contains("sc-box--long")).toBe(false);
    expect(boxes[1].classList.contains("sc-box--long")).toBe(true);
  });

  it("measures text length, not markup length", () => {
    // Heavy markup, short actual text — should stay short.
    const html =
      `<div class="sc-note">` +
      Array.from({ length: 20 }, () => "<p><strong><em>hi</em></strong></p>").join("") +
      `</div>`;
    const out = classifyLongBoxes(html);
    expect(out).not.toContain("sc-box--long");
  });
});
