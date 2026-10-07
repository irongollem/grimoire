import { describe, expect, it } from "vitest";
import { writtenOrNull } from "./writing";

/** A stored Tiptap document with one paragraph; no text gives the empty paragraph a cleared editor leaves. */
const doc = (text?: string) =>
  JSON.stringify({ type: "doc", content: [{ type: "paragraph", ...(text ? { content: [{ type: "text", text }] } : {}) }] });

describe("writtenOrNull", () => {
  it("keeps a document with text", () => {
    expect(writtenOrNull(doc("Trampled by a mammoth"))).toBe(doc("Trampled by a mammoth"));
  });
  it("drops a cleared editor's empty document", () => {
    expect(writtenOrNull(doc())).toBeNull();
  });
  it("drops nothing at all", () => {
    expect(writtenOrNull(null)).toBeNull();
    expect(writtenOrNull("")).toBeNull();
  });
});
