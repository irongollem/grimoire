import { describe, it, expect } from "vitest";
import { migrateV2ToV3, needsV2ToV3 } from "./v2ToV3";
import type { JSONContent } from "@tiptap/core";

const doc = (content: JSONContent[]): JSONContent => ({ type: "doc", content });
const para = (id?: string): JSONContent => ({
  type: "paragraph",
  ...(id ? { attrs: { blockId: id } } : {}),
  content: [{ type: "text", text: "x" }],
});

describe("migrateV2ToV3", () => {
  it("lifts a watercolor node into furniture and removes it from content", () => {
    const before = doc([
      para("b1"),
      { type: "watercolor", attrs: { variant: 3, left: "79.4px", top: "112.3px", width: "238.2px", color: "#000", opacity: 60 } },
      para("b2"),
    ]);
    const { content, furniture } = migrateV2ToV3(before);
    expect((content.content ?? []).some((n) => n.type === "watercolor")).toBe(false);
    expect((content.content ?? [])).toHaveLength(2);
    expect(furniture).toHaveLength(1);
    const f = furniture[0];
    expect(f.kind).toBe("watercolor");
    expect(f.anchor).toEqual({ type: "block", blockId: "b1" });
    expect(f.props.variant).toBe(3);
    // 79.4 / 794 * 100 = 10, 112.3 / 1123 * 100 = 10, 238.2 / 794 * 100 = 30
    expect(f.x).toBe(10);
    expect(f.y).toBe(10);
    expect(f.width).toBe(30);
  });

  it("anchors to page 1 when there is no preceding block", () => {
    const before = doc([{ type: "watermark", attrs: { text: "DRAFT" } }, para("b1")]);
    const { furniture } = migrateV2ToV3(before);
    expect(furniture[0].anchor).toEqual({ type: "page", page: 1 });
    expect(furniture[0].kind).toBe("watermark");
  });

  it("converts artistCredit and absolute images", () => {
    const before = doc([
      para("b1"),
      { type: "artistCredit", attrs: { artistName: "Jane", position: "top-left" } },
      { type: "image", attrs: { layoutMode: "absolute", posLeft: "158.8px", posTop: "56.15px", width: "317.6px", src: "u" } },
    ]);
    const { furniture } = migrateV2ToV3(before);
    expect(furniture.map((f) => f.kind)).toEqual(["artistCredit", "art"]);
    expect(furniture[0].props.artistName).toBe("Jane");
    expect(furniture[1].props.src).toBe("u");
    expect(furniture[1].x).toBe(20); // 158.8/794*100
  });

  it("leaves inline/wrap images in the content stream", () => {
    const before = doc([
      { type: "image", attrs: { layoutMode: "wrapLeft", src: "u" } },
      { type: "image", attrs: { src: "u2" } },
    ]);
    const { content, furniture } = migrateV2ToV3(before);
    expect(furniture).toHaveLength(0);
    expect(content.content).toHaveLength(2);
  });

  it("does not mutate the input", () => {
    const before = doc([para("b1"), { type: "watercolor", attrs: { variant: 1 } }]);
    const snapshot = JSON.stringify(before);
    migrateV2ToV3(before);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it("passes through docs with no decorations", () => {
    const before = doc([para("b1"), para("b2")]);
    const { content, furniture } = migrateV2ToV3(before);
    expect(furniture).toEqual([]);
    expect(content.content).toHaveLength(2);
  });

  it("needsV2ToV3 detects decorations (incl. absolute image)", () => {
    expect(needsV2ToV3(doc([{ type: "watercolor" }]))).toBe(true);
    expect(needsV2ToV3(doc([{ type: "image", attrs: { layoutMode: "absolute" } }]))).toBe(true);
    expect(needsV2ToV3(doc([para("b1")]))).toBe(false);
    expect(needsV2ToV3({} as JSONContent)).toBe(false);
  });
});
