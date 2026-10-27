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

  it.each([
    [9, "######"],
    [2.7, "##"],
    [0, "#"],
    [-3, "#"],
    [undefined, "#"],
  ])("clamps heading level %s into 1-6, so it prints %s", (level, hashes) => {
    const md = tiptapToMarkdown({
      type: "doc",
      content: [{ type: "heading", attrs: level === undefined ? {} : { level }, content: [{ type: "text", text: "T" }] }],
    });
    expect(md).toBe(`${hashes} T`);
  });

  it("drops empty headings and paragraphs rather than printing blank markers", () => {
    const md = tiptapToMarkdown({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "A" }] },
        { type: "heading", attrs: { level: 2 } },
        { type: "paragraph" },
        { type: "paragraph", content: [{ type: "text", text: "B" }] },
      ],
    });
    expect(md).toBe("A\n\nB");
  });

  it("renders a horizontal rule as ---", () => {
    const md = tiptapToMarkdown({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Above" }] },
        { type: "horizontalRule" },
        { type: "paragraph", content: [{ type: "text", text: "Below" }] },
      ],
    });
    expect(md).toBe("Above\n\n---\n\nBelow");
  });

  it("trims whitespace from the whole document", () => {
    const md = tiptapToMarkdown({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "  hi  " }] }] });
    expect(md).toBe("hi");
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

  it("puts a nested list on its own lines, indented under its parent item", () => {
    const item = (text: string, nested?: object) => ({
      type: "listItem",
      content: [{ type: "paragraph", content: [{ type: "text", text }] }, ...(nested ? [nested] : [])],
    });
    const md = tiptapToMarkdown({
      type: "doc",
      content: [
        {
          type: "orderedList",
          content: [item("Gate", { type: "bulletList", content: [item("Guard"), item("Dog")] }), item("Hall")],
        },
      ],
    });
    expect(md).toBe("1. Gate\n   - Guard\n   - Dog\n2. Hall");
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

  it("pads a short row to the widest row, and sizes the divider to the same width", () => {
    const cell = (type: string, text: string) => ({ type, content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
    const md = tiptapToMarkdown({
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            { type: "tableRow", content: [cell("tableHeader", "A")] },
            { type: "tableRow", content: [cell("tableCell", "1"), cell("tableCell", "2"), cell("tableCell", "3")] },
            { type: "tableRow", content: [cell("tableCell", "x")] },
          ],
        },
      ],
    });
    expect(md).toBe("| A |  |  |\n| --- | --- | --- |\n| 1 | 2 | 3 |\n| x |  |  |");
  });

  it("skips a table with no rows or no cells, and a list with no items", () => {
    const md = tiptapToMarkdown({
      type: "doc",
      content: [
        { type: "table", content: [] },
        { type: "table", content: [{ type: "tableRow", content: [] }] },
        { type: "bulletList", content: [] },
        { type: "paragraph", content: [{ type: "text", text: "Only this" }] },
      ],
    });
    expect(md).toBe("Only this");
  });

  it("prints an empty list item as a bare marker, without trailing space", () => {
    const md = tiptapToMarkdown({
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [{ type: "paragraph" }] },
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }] },
          ],
        },
      ],
    });
    expect(md).toBe("-\n- x");
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

  it("ignores a link mark with an empty href", () => {
    const md = tiptapToMarkdown({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "plain", marks: [{ type: "link", attrs: { href: "" } }] }] }],
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
  // Stored mentions carry no name (#932 story 3) — just id/entityType.
  const mentionDoc = {
    type: "doc",
    content: [{
      type: "paragraph",
      content: [
        { type: "text", text: "Ask " },
        { type: "entityMention", attrs: { id: "npc-1", entityType: "npc" } },
        { type: "text", text: " about it." },
      ],
    }],
  };

  it("renders '???' by default — nothing to fall back to without a resolver", () => {
    expect(tiptapToMarkdown(mentionDoc)).toBe("Ask ??? about it.");
  });

  it("renders through the mention resolver when one is passed", () => {
    const md = tiptapToMarkdown(mentionDoc, {
      mention: (attrs) => `[[${attrs.id}]]`,
    });
    expect(md).toBe("Ask [[npc-1]] about it.");
  });

  it("passes id/entityType through to the resolver", () => {
    let seen: unknown;
    tiptapToMarkdown(mentionDoc, {
      mention: (attrs) => {
        seen = attrs;
        return attrs.id;
      },
    });
    expect(seen).toEqual({ id: "npc-1", entityType: "npc" });
  });

  it("falls back to '???' when the resolver throws", () => {
    const md = tiptapToMarkdown(mentionDoc, {
      mention: () => {
        throw new Error("boom");
      },
    });
    expect(md).toBe("Ask ??? about it.");
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

describe("tiptapToMarkdown: secret blocks", () => {
  const para = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });

  it("keeps a DM-only passage as a secret callout instead of dropping it", () => {
    const md = tiptapToMarkdown({
      type: "doc",
      content: [para("Public."), { type: "secretBlock", content: [para("The vizier is the lich."), para("Second.")] }],
    });
    expect(md).toBe("Public.\n\n> [!secret] DM only\n> The vizier is the lich.\n>\n> Second.");
  });

  it("skips an empty secret block", () => {
    expect(tiptapToMarkdown({ type: "doc", content: [{ type: "secretBlock", content: [{ type: "paragraph" }] }] })).toBe("");
  });
});
