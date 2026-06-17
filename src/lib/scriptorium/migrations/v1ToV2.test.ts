import { describe, it, expect } from "vitest";
import { migrateV1ToV2, needsV1ToV2 } from "./v1ToV2";
import type { JSONContent } from "@tiptap/core";

const doc = (content: JSONContent[]): JSONContent => ({ type: "doc", content });

describe("migrateV1ToV2", () => {
  it("converts top-level horizontalRule to pageBreak", () => {
    const before = doc([
      { type: "paragraph", content: [{ type: "text", text: "a" }] },
      { type: "horizontalRule" },
      { type: "paragraph", content: [{ type: "text", text: "b" }] },
    ]);
    const after = migrateV1ToV2(before);
    expect((after.content ?? []).map((n) => n.type)).toEqual([
      "paragraph",
      "pageBreak",
      "paragraph",
    ]);
  });

  it("preserves break count exactly (3 hr → 3 pageBreak)", () => {
    const before = doc([
      { type: "horizontalRule" },
      { type: "paragraph" },
      { type: "horizontalRule" },
      { type: "paragraph" },
      { type: "horizontalRule" },
    ]);
    const after = migrateV1ToV2(before);
    const breaks = (after.content ?? []).filter((n) => n.type === "pageBreak");
    expect(breaks).toHaveLength(3);
    expect((after.content ?? []).some((n) => n.type === "horizontalRule")).toBe(false);
  });

  it("does not mutate the input doc", () => {
    const before = doc([{ type: "horizontalRule" }]);
    const snapshot = JSON.stringify(before);
    migrateV1ToV2(before);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it("leaves docs without horizontalRules unchanged", () => {
    const before = doc([{ type: "paragraph", content: [{ type: "text", text: "x" }] }]);
    expect(migrateV1ToV2(before)).toEqual(before);
  });

  it("returns non-doc / empty input unchanged", () => {
    expect(migrateV1ToV2({} as JSONContent)).toEqual({});
    expect(migrateV1ToV2({ type: "doc" } as JSONContent)).toEqual({ type: "doc" });
  });

  it("preserves node attrs/content for non-hr nodes", () => {
    const before = doc([
      { type: "heading", attrs: { level: 1, blockId: "abc" }, content: [{ type: "text", text: "T" }] },
      { type: "horizontalRule" },
    ]);
    const after = migrateV1ToV2(before);
    expect(after.content?.[0]).toEqual(before.content?.[0]);
    expect(after.content?.[1]).toEqual({ type: "pageBreak" });
  });

  it("needsV1ToV2 detects top-level horizontalRule", () => {
    expect(needsV1ToV2(doc([{ type: "horizontalRule" }]))).toBe(true);
    expect(needsV1ToV2(doc([{ type: "paragraph" }]))).toBe(false);
    expect(needsV1ToV2({} as JSONContent)).toBe(false);
  });
});
