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
