import { describe, it, expect } from "vitest";
import { collectMentions, tiptapToPlainText } from "@/lib/tiptap/tiptapText";

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

  it("puts a heading on its own line", () => {
    const doc = JSON.stringify({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Title" }] },
        { type: "paragraph", content: [{ type: "text", text: "Body" }] },
      ],
    });
    expect(tiptapToPlainText(doc)).toBe("Title\nBody");
  });

  it("turns a hard break into a line break within the paragraph", () => {
    const doc = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "one" }, { type: "hardBreak" }, { type: "text", text: "two" }],
        },
      ],
    });
    expect(tiptapToPlainText(doc)).toBe("one\ntwo");
  });

  it("returns text that parses as JSON but is not a document unchanged", () => {
    expect(tiptapToPlainText("42")).toBe("42");
    expect(tiptapToPlainText("null")).toBe("null");
  });

  it("handles list items", () => {
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

const mention = (id: string, entityType = "npc") => ({ type: "entityMention", attrs: { id, entityType } });
const withMention = JSON.stringify({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "The bell was sold by " }, mention("n1"), { type: "text", text: " to the ferryman." }] }],
});

describe("tiptapToPlainText with mentions", () => {
  // Bug: a mention stores no name, so canon text read by the AI lost it: "sold by  to the ferryman".
  it("puts the resolved name between its neighbours", () => {
    expect(tiptapToPlainText(withMention, (type, id) => (type === "npc" && id === "n1" ? "Maren Voss" : null))).toBe(
      "The bell was sold by Maren Voss to the ferryman.",
    );
  });

  // Bug: changing what no-resolver callers read (the PDF, previews) or emitting "null"/"undefined" for an unknown id.
  it("emits nothing without a resolver, or when the resolver does not know the id", () => {
    expect(tiptapToPlainText(withMention)).toBe("The bell was sold by  to the ferryman.");
    expect(tiptapToPlainText(withMention, () => null)).toBe("The bell was sold by  to the ferryman.");
  });
});

describe("collectMentions", () => {
  const doc = JSON.stringify({
    type: "doc",
    content: [
      { type: "paragraph", content: [mention("n1"), mention("n1"), mention("l1", "location")] },
      { type: "secretBlock", content: [{ type: "paragraph", content: [mention("n2")] }] },
    ],
  });

  // Bug: one name read per occurrence, or the same id under two types collapsed into one.
  it("lists each mention once and keeps the same id under another type apart", () => {
    const both = JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [mention("x"), mention("x", "faction"), mention("x")] }] });
    expect(collectMentions(both)).toEqual([{ entityType: "npc", id: "x" }, { entityType: "faction", id: "x" }]);
  });

  // Bug: a DM-only passage's mention was read for the AI, so its name would be looked up for a block the AI never sees.
  it("skips a secret block only when asked", () => {
    expect(collectMentions(doc).map((m) => m.id)).toEqual(["n1", "l1", "n2"]);
    expect(collectMentions(doc, { skipSecrets: true }).map((m) => m.id)).toEqual(["n1", "l1"]);
  });

  it("reads legacy plain text and null as holding none", () => {
    expect(collectMentions("just words")).toEqual([]);
    expect(collectMentions(null)).toEqual([]);
  });
});
