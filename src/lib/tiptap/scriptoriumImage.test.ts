// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { generateHTML, generateJSON } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { createScriptoriumExtensions } from "@/lib/scriptorium/scriptoriumExtensions";
import { cssWidth } from "./scriptoriumImage";

const EXT = createScriptoriumExtensions();

function image(attrs: Record<string, unknown>): JSONContent {
  return { type: "doc", content: [{ type: "image", attrs: { src: "https://example.com/a.webp", ...attrs } }] };
}

describe("cssWidth", () => {
  it("appends px to a bare number and keeps a percentage", () => {
    expect(cssWidth("200")).toBe("200px");
    expect(cssWidth(320)).toBe("320px");
    expect(cssWidth("50%")).toBe("50%");
    expect(cssWidth("100%")).toBe("100%");
    expect(cssWidth(" 50% ")).toBe("50%");
  });
});

describe("ScriptoriumImage width", () => {
  it("writes a percent width as a percent in the inline style", () => {
    const html = generateHTML(image({ width: "50%", dataAlign: "center" }), EXT);
    expect(html).toMatch(/width:\s*50%;/);
    expect(html).not.toContain("%px");
  });

  it("still writes a pixel width in px", () => {
    const html = generateHTML(image({ width: "200", dataAlign: "right" }), EXT);
    expect(html).toMatch(/width:\s*200px;/);
  });

  it("keeps a percent width on the absolute wrapper and survives a round trip", () => {
    const html = generateHTML(image({ width: "100%", layoutMode: "absolute", posTop: "10px" }), EXT);
    expect(html).not.toContain("%px");
    const back = generateJSON(html, EXT) as JSONContent;
    expect(back.content?.[0].attrs).toMatchObject({ width: "100%" });
  });
});

describe("ScriptoriumImage alignment and layout", () => {
  const alignOf = (html: string) => (generateJSON(html, EXT) as JSONContent).content?.[0].attrs?.dataAlign;

  it.each([
    ["left", /float:\s*left/],
    ["right", /float:\s*right/],
    ["center", /display:\s*block;\s*margin:\s*8px auto/],
  ])("writes %s alignment as its style, and reads it back", (align, style) => {
    const html = generateHTML(image({ dataAlign: align }), EXT);
    expect(html).toMatch(style);
    expect(alignOf(html)).toBe(align);
  });

  it("wraps text around a wrapped image through the wrapper, leaving the img itself unstyled", () => {
    const html = generateHTML(image({ layoutMode: "wrapLeft", dataAlign: "left", width: "40%" }), EXT);
    expect(html).toContain("sc-img-wrap sc-img-wrap--wrapLeft");
    expect(html).not.toContain("sc-img-wrap--gutter");
    expect(html).not.toContain("float:");
  });

  it("marks a gutter-bleed image on its wrapper only when asked", () => {
    expect(generateHTML(image({ layoutMode: "wrapRight", gutterBleed: true }), EXT)).toContain("sc-img-wrap--gutter");
    expect(generateHTML(image({ layoutMode: "wrapRight", gutterBleed: false }), EXT)).not.toContain("sc-img-wrap--gutter");
  });

  it("positions only an absolute image, and only on the sides that were set", () => {
    const abs = generateHTML(image({ layoutMode: "absolute", posTop: "10px", posLeft: "20px" }), EXT);
    expect(abs).toMatch(/style="top:\s*10px;\s*left:\s*20px;/);
    expect(abs).not.toContain("right:");
    const wrapped = generateHTML(image({ layoutMode: "wrapLeft", posTop: "10px" }), EXT);
    expect(wrapped).not.toMatch(/top:\s*10px/);
  });

  it("writes no position attributes for an image that has none", () => {
    expect(generateHTML(image({}), EXT)).not.toContain("data-pos-");
  });
});
