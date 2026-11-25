import { describe, expect, it } from "vitest";
import { bodyHasContent } from "./useEntryFold";

const doc = (...content: unknown[]) => JSON.stringify({ type: "doc", content });

describe("bodyHasContent", () => {
  // Bug caught: an editor's empty document counting as notes, so every entry opened with an empty editor drawn.
  it("is false for no body and for an empty document", () => {
    expect(bodyHasContent(null)).toBe(false);
    expect(bodyHasContent(doc({ type: "paragraph" }))).toBe(false);
    expect(bodyHasContent(doc({ type: "paragraph", content: [{ type: "text", text: "  " }] }))).toBe(false);
  });

  // Bug caught: notes holding only a @mention, or only a DM-only block, folded away so the DM's text seemed to vanish.
  it("is true for words, a mention or text in a DM-only block", () => {
    expect(bodyHasContent(doc({ type: "paragraph", content: [{ type: "text", text: "Why." }] }))).toBe(true);
    expect(bodyHasContent(doc({ type: "paragraph", content: [{ type: "entityMention", attrs: { id: "n1", entityType: "npc" } }] }))).toBe(true);
    expect(bodyHasContent(doc({ type: "secretBlock", content: [{ type: "paragraph", content: [{ type: "text", text: "Only me." }] }] }))).toBe(true);
  });
});
