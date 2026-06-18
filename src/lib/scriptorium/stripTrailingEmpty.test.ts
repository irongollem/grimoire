import { describe, it, expect } from "vitest";
import { stripTrailingEmptyParagraphs } from "./stripTrailingEmpty";

describe("stripTrailingEmptyParagraphs", () => {
  it("removes a single trailing empty paragraph", () => {
    expect(stripTrailingEmptyParagraphs("<h1>A</h1><p>x</p><p></p>")).toBe("<h1>A</h1><p>x</p>");
  });

  it("removes a trailing paragraph with only a <br>", () => {
    expect(stripTrailingEmptyParagraphs("<p>x</p><p><br></p>")).toBe("<p>x</p>");
  });

  it("removes trailing empties with attributes (block ids)", () => {
    expect(stripTrailingEmptyParagraphs('<p>x</p><p data-block-id="abc"></p>')).toBe("<p>x</p>");
  });

  it("removes multiple trailing empties", () => {
    expect(stripTrailingEmptyParagraphs("<p>x</p><p></p><p></p>")).toBe("<p>x</p>");
  });

  it("keeps paragraphs that have content", () => {
    expect(stripTrailingEmptyParagraphs("<p>x</p><p>y</p>")).toBe("<p>x</p><p>y</p>");
  });

  it("does not strip an empty paragraph that is not trailing", () => {
    expect(stripTrailingEmptyParagraphs("<p></p><p>y</p>")).toBe("<p></p><p>y</p>");
  });

  it("handles empty / whitespace input", () => {
    expect(stripTrailingEmptyParagraphs("")).toBe("");
    expect(stripTrailingEmptyParagraphs("<p></p>")).toBe("");
  });
});
