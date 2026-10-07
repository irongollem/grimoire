import { describe, expect, it } from "vitest";
import { storedTextToDoc } from "./markdownToTiptap";

const types = (text: string) => storedTextToDoc(text).content.map((n) => n.type);

describe("storedTextToDoc", () => {
  it("splits prose on blank lines and joins soft wraps", () => {
    const doc = storedTextToDoc("One line\nwrapped.\n\nTwo.");
    expect(doc).toEqual({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "One line wrapped." }] },
        { type: "paragraph", content: [{ type: "text", text: "Two." }] },
      ],
    });
  });

  it("converts inline emphasis in prose", () => {
    const [para] = storedTextToDoc("**Stone or crystal** 12 hours").content;
    expect(para).toEqual({
      type: "paragraph",
      content: [
        { type: "text", text: "Stone or crystal", marks: [{ type: "bold" }] },
        { type: "text", text: " 12 hours" },
      ],
    });
  });

  it("does not turn a numbered line inside prose into a list", () => {
    // A PDF line break before "15." is prose, not an ordered list.
    expect(types("The target must succeed on a\n15. On a success, nothing happens.")).toEqual(["paragraph"]);
  });

  it("parses real block markdown: lists, headings and pipe tables", () => {
    expect(types("- one\n- two")).toEqual(["bulletList"]);
    expect(types("## Title\n\nBody")).toContain("heading");
    expect(types("| d6 | Result |\n|---|---|\n| 1 | Gold |")).toEqual(["table"]);
  });

  it("returns an empty document for whitespace", () => {
    expect(storedTextToDoc(" \n\n ").content).toEqual([]);
  });
});
