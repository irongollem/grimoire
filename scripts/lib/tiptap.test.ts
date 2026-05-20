import { describe, expect, it } from "vitest";

import {
  DEITY_RICHTEXT_FIELDS,
  NPC_RICHTEXT_FIELDS,
  TIPTAP_DOC_ATTRS,
  markdownToTiptap,
  tiptapifyFields,
} from "./tiptap";

type TiptapNode = { type: string; content?: unknown[]; marks?: { type: string }[]; text?: string; attrs?: Record<string, unknown> };
type TiptapDoc = { type: "doc"; attrs: typeof TIPTAP_DOC_ATTRS; content: TiptapNode[] };

function parse(s: string | null): TiptapDoc {
  expect(s).not.toBeNull();
  return JSON.parse(s!) as TiptapDoc;
}

describe("markdownToTiptap — root doc shape", () => {
  it("emits canonical doc node with twoColumn=false attrs (matches editor default)", () => {
    const doc = parse(markdownToTiptap("hello"));
    expect(doc.type).toBe("doc");
    expect(doc.attrs).toEqual({ twoColumn: false });
    expect(Array.isArray(doc.content)).toBe(true);
  });

  it("returns null for null/empty/whitespace input (safe for nullable fields)", () => {
    expect(markdownToTiptap(null)).toBeNull();
    expect(markdownToTiptap(undefined)).toBeNull();
    expect(markdownToTiptap("")).toBeNull();
    expect(markdownToTiptap("   \n  \n  ")).toBeNull();
  });
});

describe("markdownToTiptap — paragraph content", () => {
  it("wraps a single line in one paragraph", () => {
    const doc = parse(markdownToTiptap("Just a simple sentence."));
    expect(doc.content.length).toBe(1);
    expect(doc.content[0]!.type).toBe("paragraph");
    expect((doc.content[0]!.content![0] as TiptapNode).text).toBe("Just a simple sentence.");
  });

  it("preserves multi-paragraph structure across blank lines", () => {
    const md = `First paragraph.

Second paragraph.

Third paragraph.`;
    const doc = parse(markdownToTiptap(md));
    expect(doc.content.length).toBe(3);
    expect(doc.content.every((n) => n.type === "paragraph")).toBe(true);
  });
});

describe("markdownToTiptap — inline marks", () => {
  it("converts **bold** to a bold-marked text node", () => {
    const doc = parse(markdownToTiptap("She is **the heaviest deity**."));
    const para = doc.content[0]!.content as TiptapNode[];
    const bold = para.find((n) => n.marks?.[0]?.type === "bold")!;
    expect(bold.text).toBe("the heaviest deity");
  });

  it("converts _italic_ AND *italic* to italic-marked text nodes", () => {
    const docUnderscore = parse(markdownToTiptap("Whispered: _that is the saying_."));
    const docStar = parse(markdownToTiptap("Whispered: *that is the saying*."));
    const findItalic = (d: TiptapDoc) =>
      (d.content[0]!.content as TiptapNode[]).find((n) => n.marks?.[0]?.type === "italic")!;
    expect(findItalic(docUnderscore).text).toBe("that is the saying");
    expect(findItalic(docStar).text).toBe("that is the saying");
  });
});

describe("markdownToTiptap — block-level shapes", () => {
  it("recognises bullet lists", () => {
    const doc = parse(markdownToTiptap("- one\n- two\n- three"));
    expect(doc.content[0]!.type).toBe("bulletList");
    expect((doc.content[0]!.content as TiptapNode[]).length).toBe(3);
  });

  it("recognises headings", () => {
    const doc = parse(markdownToTiptap("# Big\n\n## Medium\n\n### Small"));
    const types = doc.content.map((n) => n.type);
    expect(types).toEqual(["heading", "heading", "heading"]);
    const levels = doc.content.map((n) => (n.attrs as { level: number })?.level);
    expect(levels).toEqual([1, 2, 3]);
  });
});

describe("markdownToTiptap — synth'd **Label**\\n{content} preprocessing", () => {
  // The NPC importer's `notes` field synthesizes blocks of the form:
  //   **Emotional Core**
  //   the patron's emotional core text here.
  //
  //   **Stage**
  //   the stage info here.
  // With no blank line between label and content, the raw markdown parser
  // would join "**Emotional Core**" and the content into one paragraph. The
  // preprocessor inserts a blank line so each label becomes its own paragraph.

  it("splits **Label**\\n{content} into TWO paragraphs (label paragraph + content paragraph)", () => {
    const md = `**Emotional Core**\nShe has loved her husband.\n\n**Stage**\nLate.`;
    const doc = parse(markdownToTiptap(md));
    // Expected: 4 paragraphs (label, content, label, content)
    expect(doc.content.length).toBe(4);
    expect(doc.content[0]!.type).toBe("paragraph");
    // Label paragraph: first text node is bold "Emotional Core"
    const label0 = (doc.content[0]!.content as TiptapNode[])[0]!;
    expect(label0.marks?.[0]?.type).toBe("bold");
    expect(label0.text).toBe("Emotional Core");
    // Content paragraph: plain text
    const content0 = (doc.content[1]!.content as TiptapNode[])[0]!;
    expect(content0.text).toBe("She has loved her husband.");
  });

  it("does NOT double-blank when content already has blank-line separator (idempotent)", () => {
    const mdAlreadyBlank = `**Stage**\n\nLate.`;
    const doc = parse(markdownToTiptap(mdAlreadyBlank));
    expect(doc.content.length).toBe(2);
  });

  it("doesn't touch inline **bold** mid-paragraph (only standalone-line labels)", () => {
    const md = `This sentence has an inline **bold** word in the middle of it.`;
    const doc = parse(markdownToTiptap(md));
    expect(doc.content.length).toBe(1);
    // The bold word is a marked text node inside the single paragraph
    const para = doc.content[0]!.content as TiptapNode[];
    const bold = para.find((n) => n.marks?.[0]?.type === "bold")!;
    expect(bold.text).toBe("bold");
  });
});

describe("tiptapifyFields", () => {
  it("converts only the named fields, passes others through unchanged", () => {
    const payload = {
      name: "Master Cantor",
      tags: ["faith", "sugarwell"],
      appearance: "A warm-looking Sugarspun.",
      personality: "Hospitable, gossipy.",
      relevance: 3,
      portrait_url: null,
    };
    const out = tiptapifyFields(payload, NPC_RICHTEXT_FIELDS);
    // Untouched non-rich fields
    expect(out.name).toBe("Master Cantor");
    expect(out.tags).toEqual(["faith", "sugarwell"]);
    expect(out.relevance).toBe(3);
    expect(out.portrait_url).toBeNull();
    // Converted prose fields parse as Tiptap docs
    expect(parse(out.appearance as string).type).toBe("doc");
    expect(parse(out.personality as string).type).toBe("doc");
  });

  it("skips fields not present in payload (so updates-map use is safe)", () => {
    const updates = { pantheon_id: "abc-123", tags: ["a"] };
    const out = tiptapifyFields(updates, DEITY_RICHTEXT_FIELDS);
    expect(out).toEqual(updates);
    expect("description" in out).toBe(false);
    expect("dm_notes" in out).toBe(false);
  });

  it("leaves null values as null (no spurious empty docs)", () => {
    const out = tiptapifyFields(
      { appearance: null, personality: "text here" },
      NPC_RICHTEXT_FIELDS,
    );
    expect(out.appearance).toBeNull();
    expect(out.personality).not.toBeNull();
  });

  it("leaves non-string values untouched (defensive)", () => {
    const out = tiptapifyFields(
      { appearance: { already: "an object" } as unknown as string },
      NPC_RICHTEXT_FIELDS,
    );
    expect(out.appearance).toEqual({ already: "an object" });
  });
});
