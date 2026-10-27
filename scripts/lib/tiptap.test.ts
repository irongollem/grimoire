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

  it("returns a new object and leaves the merge engine's own payload as plain markdown", () => {
    const payload = { appearance: "A warm-looking Sugarspun." };
    const out = tiptapifyFields(payload, NPC_RICHTEXT_FIELDS);
    expect(out).not.toBe(payload);
    expect(payload.appearance).toBe("A warm-looking Sugarspun.");
  });

  it("skips fields not present in payload (so updates-map use is safe)", () => {
    const updates = { pantheon_id: "abc-123", tags: ["a"] };
    const out = tiptapifyFields(updates, DEITY_RICHTEXT_FIELDS);
    expect(out).toEqual(updates);
    expect("description" in out).toBe(false);
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
