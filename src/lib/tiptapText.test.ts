import { describe, it, expect } from "vitest";
import { tiptapToPlainText } from "@/lib/tiptapText";

describe("tiptapToPlainText", () => {
  it("returns empty string for null/undefined/empty", () => {
    expect(tiptapToPlainText(null)).toBe("");
    expect(tiptapToPlainText(undefined)).toBe("");
    expect(tiptapToPlainText("")).toBe("");
  });

  it("passes through legacy plain text unchanged", () => {
    expect(tiptapToPlainText("I always have a plan.")).toBe(
      "I always have a plan.",
    );
  });

  it("extracts text from a single paragraph doc", () => {
    const doc = JSON.stringify({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Brave but reckless" }] },
      ],
    });
    expect(tiptapToPlainText(doc)).toBe("Brave but reckless");
  });

  it("joins multiple paragraphs with newlines", () => {
    const doc = JSON.stringify({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Line one" }] },
        { type: "paragraph", content: [{ type: "text", text: "Line two" }] },
      ],
    });
    expect(tiptapToPlainText(doc)).toBe("Line one\nLine two");
  });

  it("flattens marks and nested inline content", () => {
    const doc = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "A " },
            { type: "text", text: "bold", marks: [{ type: "bold" }] },
            { type: "text", text: " ideal" },
          ],
        },
      ],
    });
    expect(tiptapToPlainText(doc)).toBe("A bold ideal");
  });

  it("handles list items and hard breaks", () => {
    const doc = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "one" }] }] },
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "two" }] }] },
          ],
        },
      ],
    });
    expect(tiptapToPlainText(doc)).toBe("one\ntwo");
  });

  it("returns an empty string for an empty doc", () => {
    const doc = JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] });
    expect(tiptapToPlainText(doc)).toBe("");
  });
});
