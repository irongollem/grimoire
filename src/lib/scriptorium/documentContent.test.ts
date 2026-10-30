// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import type { JSONContent } from "@tiptap/core";
import {
  htmlToScriptoriumJson,
  normalizeImportedDocument,
  emptyDoc,
} from "./documentContent";

const doc = (content: JSONContent[]): JSONContent => ({ type: "doc", content });
const para = (id?: string): JSONContent => ({
  type: "paragraph",
  ...(id ? { attrs: { blockId: id } } : {}),
  content: [{ type: "text", text: "x" }],
});

describe("htmlToScriptoriumJson", () => {
  it("converts plain HTML into Tiptap JSON", () => {
    const { content, furniture } = htmlToScriptoriumJson("<h1>Title</h1><p>Body text.</p>", "ch1");
    expect(content.type).toBe("doc");
    expect((content.content ?? []).map((n) => n.type)).toEqual(["heading", "paragraph"]);
    expect(furniture).toEqual([]);
  });

  it("converts a top-level <hr> into a pageBreak node", () => {
    const { content } = htmlToScriptoriumJson("<p>a</p><hr><p>b</p>", "ch1");
    expect((content.content ?? []).map((n) => n.type)).toEqual([
      "paragraph",
      "pageBreak",
      "paragraph",
    ]);
  });

  it("lifts a legacy watercolor <img> into furniture, anchored to page 1 of its chapter", () => {
    const html =
      '<p>a</p><img data-type="watercolor" data-variant="3" data-left="79.4px" data-top="112.3px" data-width="238.2px" data-color="#000" data-opacity="60"><p>b</p>';
    const { content, furniture } = htmlToScriptoriumJson(html, "ch1");
    expect((content.content ?? []).map((n) => n.type)).toEqual(["paragraph", "paragraph"]);
    expect(furniture).toHaveLength(1);
    const f = furniture[0];
    expect(f.kind).toBe("watercolor");
    expect(f.anchor).toEqual({ type: "page", chapterId: "ch1", page: 1 });
    expect(f.props.variant).toBe(3);
    expect(f.x).toBe(10); // 79.4 / 794 * 100
    expect(f.y).toBe(10); // 112.3 / 1123 * 100
    expect(f.width).toBe(30); // 238.2 / 794 * 100
  });

  it("a legacy watercolor with no variant or width still gets a usable variant and a visible width", () => {
    const { furniture } = htmlToScriptoriumJson('<img data-type="watercolor">', "ch1");
    expect(furniture[0].props.variant).toBe(1);
    expect(furniture[0].width).toBeGreaterThan(0);
  });

  it("lifts a legacy watermark <div> into furniture without leaking its text", () => {
    const html = '<p>a</p><div data-type="watermark" data-text="DRAFT" data-rotation="-30" data-opacity="15"><span>DRAFT</span></div>';
    const { content, furniture } = htmlToScriptoriumJson(html, "ch1");
    expect((content.content ?? []).map((n) => n.type)).toEqual(["paragraph"]);
    expect(furniture).toHaveLength(1);
    expect(furniture[0].kind).toBe("watermark");
    expect(furniture[0].props.text).toBe("DRAFT");
  });

  it("lifts a legacy artistCredit <div> into furniture", () => {
    const html = '<div data-type="artistCredit" data-artist-name="Jane" data-position="top-left"></div>';
    const { furniture } = htmlToScriptoriumJson(html, "ch1");
    expect(furniture).toHaveLength(1);
    expect(furniture[0].kind).toBe("artistCredit");
    expect(furniture[0].props.artistName).toBe("Jane");
    expect(furniture[0].props.position).toBe("top-left");
  });

  it("lifts an absolute-positioned image into furniture via the current schema", () => {
    const html =
      '<div class="sc-img-wrap sc-img-wrap--absolute" style="top:56.15px;left:158.8px;width:317.6px"><img data-layout-mode="absolute" data-pos-top="56.15px" data-pos-left="158.8px" width="317.6px" src="u"></div>';
    const { content, furniture } = htmlToScriptoriumJson(html, "ch1");
    expect((content.content ?? []).some((n) => n.type === "image")).toBe(false);
    expect(furniture).toHaveLength(1);
    expect(furniture[0].kind).toBe("art");
    expect(furniture[0].props.src).toBe("u");
  });
});

describe("normalizeImportedDocument", () => {
  it("passes a current-version Tiptap object through as an object", () => {
    const json = doc([para("b1")]);
    const result = normalizeImportedDocument({ content: json, page_furniture: [] }, "ch1");
    expect(result.content).toEqual(json);
    expect(result.page_furniture).toEqual([]);
  });

  it("reads a JSON string from an older bundle into an object, not a string", () => {
    const json = doc([para("b1")]);
    const result = normalizeImportedDocument({ content: JSON.stringify(json) }, "ch1");
    expect(result.content).toEqual(json);
  });

  it("preserves existing page_furniture on an already-current row", () => {
    const existing = [
      {
        id: "f1",
        kind: "watercolor",
        anchor: { type: "page", chapterId: "ch1", page: 1 },
        x: 1,
        y: 1,
        width: 1,
        z: "under",
        props: {},
      },
    ];
    const result = normalizeImportedDocument({ content: doc([para("b1")]), page_furniture: existing }, "ch1");
    expect(result.page_furniture).toEqual(existing);
  });

  it("migrates a pre-v3 JSON row (top-level hr + decoration node), anchoring lifted furniture to the chapter", () => {
    const legacy = doc([
      { type: "watercolor", attrs: { variant: 1 } },
      para("b1"),
      { type: "horizontalRule" },
      { type: "watercolor", attrs: { variant: 2 } },
    ]);
    const result = normalizeImportedDocument({ content: JSON.stringify(legacy) }, "ch9");
    expect((result.content.content ?? []).map((n) => n.type)).toEqual(["paragraph", "pageBreak"]);
    expect(result.page_furniture.map((f) => f.anchor)).toEqual([
      { type: "page", chapterId: "ch9", page: 1 },
      { type: "block", blockId: "b1" },
    ]);
  });

  it("converts a raw-HTML row (the two pre-story-3 production documents' shape)", () => {
    const result = normalizeImportedDocument({ content: "<h1>Old Doc</h1><p>Some html body.</p>" }, "ch1");
    expect(result.content.type).toBe("doc");
    expect((result.content.content ?? []).map((n) => n.type)).toEqual(["heading", "paragraph"]);
  });

  it("turns a null, blank or missing body into an empty document instead of null", () => {
    for (const row of [{ content: null }, { content: "  " }, {}]) {
      expect(normalizeImportedDocument(row, "ch1")).toEqual({ content: emptyDoc(), page_furniture: [] });
    }
  });
});
