import { describe, expect, it } from "vitest";
import { tiptapToMarkdown } from "./tiptapToMarkdown";
import { markdownToTiptapJson, parseMarkdown } from "./markdownToTiptap";

describe("tiptapToMarkdown — absent/malformed input", () => {
  it("returns an empty string for null, undefined and empty string", () => {
    expect(tiptapToMarkdown(null)).toBe("");
    expect(tiptapToMarkdown(undefined)).toBe("");
    expect(tiptapToMarkdown("")).toBe("");
  });

  it("returns an empty string for malformed JSON rather than throwing", () => {
    expect(tiptapToMarkdown("{not json")).toBe("");
  });

  it("returns an empty string for valid JSON with no content array", () => {
    expect(tiptapToMarkdown('{"type":"doc"}')).toBe("");
    expect(tiptapToMarkdown("42")).toBe("");
  });

  it("accepts an already-parsed object, not just a JSON string", () => {
    expect(tiptapToMarkdown({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "hi" }] }] })).toBe("hi");
  });
});

describe("tiptapToMarkdown — block types", () => {
  it("renders headings 1-6 with the right number of #s", () => {
    for (let level = 1; level <= 6; level++) {
      const md = tiptapToMarkdown({
        type: "doc",
        content: [{ type: "heading", attrs: { level }, content: [{ type: "text", text: "Title" }] }],
      });
      expect(md).toBe(`${"#".repeat(level)} Title`);
    }
  });

  it("renders a plain paragraph", () => {
    const md = tiptapToMarkdown({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Hello there." }] }],
    });
    expect(md).toBe("Hello there.");
  });

  it("separates multiple blocks with a blank line", () => {
    const md = tiptapToMarkdown({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "First." }] },
        { type: "paragraph", content: [{ type: "text", text: "Second." }] },
      ],
    });
    expect(md).toBe("First.\n\nSecond.");
  });

  it("renders a blockquote with a > prefix", () => {
    const md = tiptapToMarkdown({
      type: "doc",
      content: [{ type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "Boxed text." }] }] }],
    });
    expect(md).toBe("> Boxed text.");
  });

  it("renders a bullet list", () => {
    const md = tiptapToMarkdown({
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "One" }] }] },
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Two" }] }] },
          ],
        },
      ],
    });
    expect(md).toBe("- One\n- Two");
  });

  it("renders an ordered list numbered from 1", () => {
    const md = tiptapToMarkdown({
      type: "doc",
      content: [
        {
          type: "orderedList",
          content: [
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "One" }] }] },
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Two" }] }] },
          ],
        },
      ],
    });
    expect(md).toBe("1. One\n2. Two");
  });

  it("renders a table as a GitHub-flavoured markdown table", () => {
    const md = tiptapToMarkdown({
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Name" }] }] },
                { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "HP" }] }] },
              ],
            },
            {
              type: "tableRow",
              content: [
                { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "Owlbear" }] }] },
                { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "59" }] }] },
              ],
            },
          ],
        },
      ],
    });
    expect(md).toBe("| Name | HP |\n| --- | --- |\n| Owlbear | 59 |");
  });

  it("skips a node type it doesn't recognize instead of throwing", () => {
    const md = tiptapToMarkdown({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Before" }] },
        { type: "someFutureNode", content: [{ type: "text", text: "should not appear" }] },
        { type: "paragraph", content: [{ type: "text", text: "After" }] },
      ],
    });
    expect(md).toBe("Before\n\nAfter");
  });
});

describe("tiptapToMarkdown — inline marks and breaks", () => {
  it("renders bold and italic text", () => {
    const md = tiptapToMarkdown({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "bold", marks: [{ type: "bold" }] },
            { type: "text", text: " and " },
            { type: "text", text: "italic", marks: [{ type: "italic" }] },
          ],
        },
      ],
    });
    expect(md).toBe("**bold** and _italic_");
  });

  it("renders a hard break inside a paragraph", () => {
    const md = tiptapToMarkdown({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Line one" }, { type: "hardBreak" }, { type: "text", text: "Line two" }],
        },
      ],
    });
    expect(md).toBe("Line one  \nLine two");
  });
});

describe("tiptapToMarkdown — marks added for #932 (link, strike, code)", () => {
  it("renders a link mark as [text](href)", () => {
    const md = tiptapToMarkdown({
      type: "doc",
      content: [{
        type: "paragraph",
        content: [{ type: "text", text: "the guide", marks: [{ type: "link", attrs: { href: "https://example.com" } }] }],
      }],
    });
    expect(md).toBe("[the guide](https://example.com)");
  });

  it("wraps a bold link outermost: [**bold**](href)", () => {
    const md = tiptapToMarkdown({
      type: "doc",
      content: [{
        type: "paragraph",
        content: [{
          type: "text",
          text: "bold link",
          marks: [{ type: "bold" }, { type: "link", attrs: { href: "https://example.com" } }],
        }],
      }],
    });
    expect(md).toBe("[**bold link**](https://example.com)");
  });

  it("ignores a link mark with no href", () => {
    const md = tiptapToMarkdown({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "plain", marks: [{ type: "link", attrs: {} }] }] }],
    });
    expect(md).toBe("plain");
  });

  it("renders strike as ~~text~~", () => {
    const md = tiptapToMarkdown({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "gone", marks: [{ type: "strike" }] }] }],
    });
    expect(md).toBe("~~gone~~");
  });

  it("renders code as `text`", () => {
    const md = tiptapToMarkdown({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "npc.name", marks: [{ type: "code" }] }] }],
    });
    expect(md).toBe("`npc.name`");
  });
});

describe("tiptapToMarkdown — image node (#932)", () => {
  it("renders an image node as ![alt](src)", () => {
    const md = tiptapToMarkdown({
      type: "doc",
      content: [{ type: "image", attrs: { src: "https://cdn.example.com/portrait.webp", alt: "Owlbear" } }],
    });
    expect(md).toBe("![Owlbear](https://cdn.example.com/portrait.webp)");
  });

  it("renders an empty alt as an empty bracket, not the word 'null'", () => {
    const md = tiptapToMarkdown({
      type: "doc",
      content: [{ type: "image", attrs: { src: "https://cdn.example.com/portrait.webp" } }],
    });
    expect(md).toBe("![](https://cdn.example.com/portrait.webp)");
  });

  it("skips an image node with no src", () => {
    const md = tiptapToMarkdown({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Before" }] },
        { type: "image", attrs: { alt: "orphaned" } },
        { type: "paragraph", content: [{ type: "text", text: "After" }] },
      ],
    });
    expect(md).toBe("Before\n\nAfter");
  });
});

describe("tiptapToMarkdown — entityMention (#932)", () => {
  const mentionDoc = {
    type: "doc",
    content: [{
      type: "paragraph",
      content: [
        { type: "text", text: "Ask " },
        { type: "entityMention", attrs: { id: "npc-1", entityType: "npc", label: "Elminster" } },
        { type: "text", text: " about it." },
      ],
    }],
  };

  it("renders the plain label by default — unchanged behaviour for existing callers", () => {
    expect(tiptapToMarkdown(mentionDoc)).toBe("Ask Elminster about it.");
  });

  it("renders through the mention resolver when one is passed", () => {
    const md = tiptapToMarkdown(mentionDoc, {
      mention: (attrs) => `[[${attrs.label}]]`,
    });
    expect(md).toBe("Ask [[Elminster]] about it.");
  });

  it("passes id/entityType/label through to the resolver", () => {
    let seen: unknown;
    tiptapToMarkdown(mentionDoc, {
      mention: (attrs) => {
        seen = attrs;
        return attrs.label;
      },
    });
    expect(seen).toEqual({ id: "npc-1", entityType: "npc", label: "Elminster" });
  });

  it("falls back to the plain label when the resolver throws", () => {
    const md = tiptapToMarkdown(mentionDoc, {
      mention: () => {
        throw new Error("boom");
      },
    });
    expect(md).toBe("Ask Elminster about it.");
  });
});

describe("tiptapToMarkdown — round trip with markdownToTiptap", () => {
  it("round-trips headings, a blockquote and a list back to equivalent markdown", () => {
    const source = "## Chapter Title\n\n> Boxed text for the party.\n\n- First\n- Second";
    const json = markdownToTiptapJson(source);
    const md = tiptapToMarkdown(json);
    // Re-parsing the round-tripped markdown should yield the same node
    // structure as parsing the original — the exact string need not match
    // byte-for-byte (whitespace/formatting choices differ), but no
    // structure should be lost.
    expect(parseMarkdown(md)).toEqual(parseMarkdown(source));
  });

  // A blockquote with two paragraphs. The separator used to be `">\n"`, which
  // appended a stray `>` to the previous line — `> First para>` — and rendered
  // as a literal angle bracket inside the quote. Single-paragraph quotes hid
  // it, and those are the common case for a read-aloud box.
  it("separates blockquote paragraphs with a quoted blank line, not a stray marker", () => {
    const doc = {
      type: "doc",
      content: [{
        type: "blockquote",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "First para" }] },
          { type: "paragraph", content: [{ type: "text", text: "Second para" }] },
        ],
      }],
    };
    const md = tiptapToMarkdown(doc);
    expect(md).toBe("> First para\n>\n> Second para");
    expect(md).not.toContain("para>");
  });
});
