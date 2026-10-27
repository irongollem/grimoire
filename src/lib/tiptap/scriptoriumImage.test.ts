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
