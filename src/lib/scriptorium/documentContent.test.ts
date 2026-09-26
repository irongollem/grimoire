import { describe, it, expect } from "vitest";
import type { JSONContent } from "@tiptap/core";
import {
  parseStoredContent,
  UnreadableDocumentError,
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

describe("parseStoredContent", () => {
  it("returns an empty doc for null/empty content", () => {
    expect(parseStoredContent(null)).toEqual(emptyDoc());
    expect(parseStoredContent("")).toEqual(emptyDoc());
  });

  it("parses a current-version JSON string", () => {
    const json = doc([para("b1")]);
    expect(parseStoredContent(JSON.stringify(json))).toEqual(json);
  });

  it("throws UnreadableDocumentError on invalid JSON", () => {
    expect(() => parseStoredContent("not json")).toThrow(UnreadableDocumentError);
  });

  it("throws UnreadableDocumentError on raw HTML — no silent fallback", () => {
    expect(() => parseStoredContent("<p>legacy html</p>")).toThrow(UnreadableDocumentError);
  });

  it("throws UnreadableDocumentError on valid JSON that isn't a Tiptap doc", () => {
    expect(() => parseStoredContent(JSON.stringify({ foo: "bar" }))).toThrow(
      UnreadableDocumentError,
    );
    expect(() => parseStoredContent(JSON.stringify([1, 2, 3]))).toThrow(UnreadableDocumentError);
  });
});

describe("htmlToScriptoriumJson", () => {
  it("converts plain HTML into Tiptap JSON", () => {
    const { content, furniture } = htmlToScriptoriumJson("<h1>Title</h1><p>Body text.</p>");
    expect(content.type).toBe("doc");
    expect((content.content ?? []).map((n) => n.type)).toEqual(["heading", "paragraph"]);
    expect(furniture).toEqual([]);
  });

  it("converts a top-level <hr> into a pageBreak node", () => {
    const { content } = htmlToScriptoriumJson("<p>a</p><hr><p>b</p>");
    expect((content.content ?? []).map((n) => n.type)).toEqual([
      "paragraph",
      "pageBreak",
      "paragraph",
    ]);
  });

  it("lifts a legacy watercolor <img> into furniture, anchored to page 1", () => {
    const html =
      '<p>a</p><img data-type="watercolor" data-variant="3" data-left="79.4px" data-top="112.3px" data-width="238.2px" data-color="#000" data-opacity="60"><p>b</p>';
    const { content, furniture } = htmlToScriptoriumJson(html);
    expect((content.content ?? []).map((n) => n.type)).toEqual(["paragraph", "paragraph"]);
    expect(furniture).toHaveLength(1);
    const f = furniture[0];
    expect(f.kind).toBe("watercolor");
    expect(f.anchor).toEqual({ type: "page", page: 1 });
    expect(f.props.variant).toBe(3);
    expect(f.x).toBe(10); // 79.4 / 794 * 100
    expect(f.y).toBe(10); // 112.3 / 1123 * 100
    expect(f.width).toBe(30); // 238.2 / 794 * 100
  });

  it("lifts a legacy watermark <div> into furniture without leaking its text", () => {
    const html = '<p>a</p><div data-type="watermark" data-text="DRAFT" data-rotation="-30" data-opacity="15"><span>DRAFT</span></div>';
    const { content, furniture } = htmlToScriptoriumJson(html);
    expect((content.content ?? []).map((n) => n.type)).toEqual(["paragraph"]);
    expect(furniture).toHaveLength(1);
    expect(furniture[0].kind).toBe("watermark");
    expect(furniture[0].props.text).toBe("DRAFT");
  });

  it("lifts a legacy artistCredit <div> into furniture", () => {
    const html = '<div data-type="artistCredit" data-artist-name="Jane" data-position="top-left"></div>';
    const { furniture } = htmlToScriptoriumJson(html);
    expect(furniture).toHaveLength(1);
    expect(furniture[0].kind).toBe("artistCredit");
    expect(furniture[0].props.artistName).toBe("Jane");
    expect(furniture[0].props.position).toBe("top-left");
  });

  it("lifts an absolute-positioned image into furniture via the current schema", () => {
    const html =
      '<div class="sc-img-wrap sc-img-wrap--absolute" style="top:56.15px;left:158.8px;width:317.6px"><img data-layout-mode="absolute" data-pos-top="56.15px" data-pos-left="158.8px" width="317.6px" src="u"></div>';
    const { content, furniture } = htmlToScriptoriumJson(html);
    expect((content.content ?? []).some((n) => n.type === "image")).toBe(false);
    expect(furniture).toHaveLength(1);
    expect(furniture[0].kind).toBe("art");
    expect(furniture[0].props.src).toBe("u");
  });
});

describe("normalizeImportedDocument", () => {
  it("passes through a current-version JSON row unchanged (plus stringify)", () => {
    const json = doc([para("b1")]);
    const row = { content: JSON.stringify(json), page_furniture: [] };
    const result = normalizeImportedDocument(row);
    expect(JSON.parse(result.content ?? "")).toEqual(json);
    expect(result.page_furniture).toEqual([]);
  });

  it("preserves existing page_furniture on an already-current row", () => {
    const existing = [
      {
        id: "f1",
        kind: "watercolor",
        anchor: { type: "page", page: 1 },
        x: 1,
        y: 1,
        width: 1,
        z: "under",
        props: {},
      },
    ];
    const row = { content: JSON.stringify(doc([para("b1")])), page_furniture: existing };
    const result = normalizeImportedDocument(row);
    expect(result.page_furniture).toEqual(existing);
  });

  it("migrates a pre-v3 JSON row (top-level hr + decoration node)", () => {
    const legacy = doc([
      para("b1"),
      { type: "horizontalRule" },
      { type: "watercolor", attrs: { variant: 1 } },
      para("b2"),
    ]);
    const row = { content: JSON.stringify(legacy) };
    const result = normalizeImportedDocument(row);
    const parsed = JSON.parse(result.content ?? "") as JSONContent;
    expect((parsed.content ?? []).map((n) => n.type)).toEqual(["paragraph", "pageBreak", "paragraph"]);
    expect(result.page_furniture).toHaveLength(1);
    expect(result.page_furniture[0].kind).toBe("watercolor");
    expect(result.page_furniture[0].anchor).toEqual({ type: "block", blockId: "b1" });
  });

  it("converts a raw-HTML row (the two pre-story-3 production documents' shape)", () => {
    const row = { content: "<h1>Old Doc</h1><p>Some html body.</p>" };
    const result = normalizeImportedDocument(row);
    const parsed = JSON.parse(result.content ?? "") as JSONContent;
    expect(parsed.type).toBe("doc");
    expect((parsed.content ?? []).map((n) => n.type)).toEqual(["heading", "paragraph"]);
  });

  it("handles a null/empty content row without throwing", () => {
    expect(normalizeImportedDocument({ content: null })).toEqual({
      content: null,
      page_furniture: [],
    });
    expect(normalizeImportedDocument({})).toEqual({ content: null, page_furniture: [] });
  });
});
