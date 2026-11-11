// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { generateHTML, generateJSON } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { createScriptoriumExtensions } from "@/scriptorium/lib/scriptoriumExtensions";
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

  it("an old pasted absolute image parses as inline, not as a mode nothing draws", () => {
    const html =
      '<div class="sc-img-wrap sc-img-wrap--absolute"><img data-layout-mode="absolute" data-pos-top="10px" src="https://example.com/a.webp"></div>';
    const attrs = (generateJSON(html, EXT) as JSONContent).content?.[0].attrs;
    expect(attrs?.layoutMode).toBe("inline");
    expect(attrs).not.toHaveProperty("posTop");
  });

  it("keeps a wrap mode through an HTML round trip", () => {
    const html = generateHTML(image({ layoutMode: "wrapRight" }), EXT);
    expect((generateJSON(html, EXT) as JSONContent).content?.[0].attrs?.layoutMode).toBe("wrapRight");
  });
});
