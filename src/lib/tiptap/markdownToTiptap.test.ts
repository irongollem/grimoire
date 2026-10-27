import { describe, expect, it } from "vitest";
import {
  looksLikeMarkdown,
  markdownToTiptapJson,
  parseMarkdown,
  sanitizePasteText,
  storedTextToDoc,
  toTiptapJson,
} from "./markdownToTiptap";

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

describe("sanitizePasteText", () => {
  it.each([
    ["soft hyphen", "\u00AD", ""],
    ["zero-width space", "\u200B", ""],
    ["zero-width non-joiner", "\u200C", ""],
    ["zero-width joiner", "\u200D", ""],
    ["byte order mark", "\uFEFF", ""],
    ["non-breaking space", "\u00A0", " "],
  ])("turns a %s from a pasted PDF into %j", (_name, ch, replacement) => {
    expect(sanitizePasteText(`un${ch}breakable`)).toBe(`un${replacement}breakable`);
  });
});

describe("looksLikeMarkdown", () => {
  it.each(["# Heading", "intro\n\n### Deep heading", "> a quote", "- one\n- two", "* one\n* two", "1. one\n2. two"])(
    "treats %j as intentional markdown",
    (text) => expect(looksLikeMarkdown(text)).toBe(true),
  );

  it.each([
    ["a single list item, which is a sentence that begins like one", "- just one"],
    ["a numbered sentence broken by a PDF line wrap", "The target must succeed on a\n15. On a success, nothing happens."],
    ["plain prose", "Nothing to convert here."],
    ["a hash with no space", "#hashtag"],
  ])("does not treat %s as markdown", (_name, text) => expect(looksLikeMarkdown(text)).toBe(false));
});

describe("parseMarkdown and markdownToTiptapJson", () => {
  it("never return an empty document: blank text is one empty paragraph", () => {
    expect(parseMarkdown("   ")).toEqual([{ type: "paragraph" }]);
    expect(JSON.parse(markdownToTiptapJson(""))).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
  });
});

describe("toTiptapJson", () => {
  const content = (text: string) => JSON.parse(toTiptapJson(text)).content;
  const heading = (level: number, text: string) => ({ type: "heading", attrs: { level }, content: [{ type: "text", text }] });
  const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });

  it("separates blocks on blank lines", () => {
    expect(content("One.\n\n\nTwo.")).toEqual([paragraph("One."), paragraph("Two.")]);
  });

  it("reads # marks as heading levels, alone or with the paragraph that follows on the next line", () => {
    expect(content("## Title")).toEqual([heading(2, "Title")]);
    expect(content("### Title\nThe body.")).toEqual([heading(3, "Title"), paragraph("The body.")]);
  });

  it("leaves a # with no space after it as ordinary text", () => {
    expect(content("#hashtag")).toEqual([paragraph("#hashtag")]);
  });

  it("an empty string is one empty paragraph", () => {
    expect(content("")).toEqual([{ type: "paragraph" }]);
  });
});
