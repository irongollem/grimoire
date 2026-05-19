import { describe, expect, it } from "vitest";

import { detectFieldFormat, needsConversion } from "./plaintext-detection";

describe("detectFieldFormat", () => {
  it("returns 'empty' for null/undefined/empty/whitespace-only", () => {
    expect(detectFieldFormat(null)).toBe("empty");
    expect(detectFieldFormat(undefined)).toBe("empty");
    expect(detectFieldFormat("")).toBe("empty");
    expect(detectFieldFormat("   ")).toBe("empty");
    expect(detectFieldFormat("\n\t ")).toBe("empty");
  });

  it("returns 'tiptap' for canonical doc-rooted JSON", () => {
    const docs = [
      '{"type":"doc","content":[]}',
      '{"type":"doc","attrs":{"twoColumn":false},"content":[{"type":"paragraph"}]}',
      // Whitespace in/around JSON is fine for JSON.parse
      '  {"type":"doc","content":[]}  ',
    ];
    for (const d of docs) expect(detectFieldFormat(d)).toBe("tiptap");
  });

  it("returns 'plaintext' for prose markdown / regular strings", () => {
    const samples = [
      "Just a plain sentence.",
      "A multi-line\n\nmarkdown body with **bold** and _italic_.",
      "- bullet one\n- bullet two",
      "## Heading\n\nText",
      // Plain prose that happens to mention { or } as glyphs
      "She wore { strange } sigils on her belt.",
    ];
    for (const s of samples) expect(detectFieldFormat(s)).toBe("plaintext");
  });

  it("returns 'plaintext' for invalid JSON (starts with { but doesn't parse)", () => {
    // Looks like JSON but isn't — treat as plain text rather than corrupting.
    expect(detectFieldFormat('{"type":"doc"')).toBe("plaintext");
    expect(detectFieldFormat("{not actually json}")).toBe("plaintext");
  });

  it("returns 'unknown-json' for valid JSON that isn't a doc-rooted Tiptap doc", () => {
    // Legacy ProseMirror dumps, plain objects, arrays — surface for review
    // rather than silently treating as plain text and double-converting.
    const others = [
      '{"some":"other","object":true}',
      "[1, 2, 3]",
      '{"type":"paragraph","content":[]}', // node, not doc-rooted
      '{"type":"heading","attrs":{"level":1}}',
    ];
    for (const v of others) expect(detectFieldFormat(v)).toBe("unknown-json");
  });

  it("treats non-string values as 'unknown-json' (defensive)", () => {
    // DB returns string-or-null for these columns, but be defensive — a
    // future schema change to JSONB would surface as 'unknown-json' rather
    // than silently coercing.
    expect(detectFieldFormat({ type: "doc" })).toBe("unknown-json");
    expect(detectFieldFormat(42)).toBe("unknown-json");
    expect(detectFieldFormat(true)).toBe("unknown-json");
  });
});

describe("needsConversion", () => {
  it("is true only for plaintext", () => {
    expect(needsConversion("A plain sentence.")).toBe(true);
    expect(needsConversion("")).toBe(false);
    expect(needsConversion(null)).toBe(false);
    expect(needsConversion('{"type":"doc","content":[]}')).toBe(false);
    expect(needsConversion('{"type":"paragraph"}')).toBe(false); // unknown-json
  });
});
