import { describe, expect, it } from "vitest";
import { plainWithoutSecrets } from "./secretBlocks";

const para = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });

describe("plainWithoutSecrets", () => {
  // Bug caught: tiptapToPlainText keeps a secretBlock's text, so an AI would be told what only the DM may know.
  it("drops DM-only blocks at any depth and keeps legacy plain text", () => {
    const doc = JSON.stringify({ type: "doc", content: [para("Open."), { type: "blockquote", content: [{ type: "secretBlock", content: [para("HIDDEN")] }] }] });
    expect(plainWithoutSecrets(doc)).toBe("Open.");
    expect(plainWithoutSecrets("Just text.")).toBe("Just text.");
    expect(plainWithoutSecrets(null)).toBe("");
  });
});

describe("plainWithoutSecrets with mentions", () => {
  const doc = JSON.stringify({
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Ask " }, { type: "entityMention", attrs: { id: "n1", entityType: "npc" } }, { type: "text", text: "." }] },
      { type: "secretBlock", content: [{ type: "paragraph", content: [{ type: "entityMention", attrs: { id: "n2", entityType: "npc" } }] }] },
    ],
  });
  // Bug: the resolver was not passed through, so the name vanished; or a secret block's mention name leaked.
  it("names a mention outside a secret block and still drops the block", () => {
    expect(plainWithoutSecrets(doc, (_t, id) => ({ n1: "Maren", n2: "THE LICH" })[id] ?? null)).toBe("Ask Maren.");
  });
});
