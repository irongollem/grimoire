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

describe("ScriptoriumImage recipe", () => {
  const recipe = { v: 1, seed: 7, steps: [{ type: "mask", url: "https://cdn/m.png" }] };
  const attrsOf = (html: string) => (generateJSON(html, EXT) as JSONContent).content?.[0].attrs;

  it("writes the recipe as JSON text beside the original and the hash, and reads it back as an object", () => {
    const html = generateHTML(image({ original: "https://cdn/o.webp", illuminate: recipe, bakedFor: "abc" }), EXT);
    expect(html).toContain('data-original="https://cdn/o.webp"');
    expect(html).toContain('data-baked-for="abc"');
    expect(html).toContain("data-illuminate=");
    const attrs = attrsOf(html);
    expect(attrs?.original).toBe("https://cdn/o.webp");
    expect(attrs?.bakedFor).toBe("abc");
    expect(attrs?.illuminate).toEqual(recipe);
  });

  it("keeps the recipe through a wrapped image's wrapper", () => {
    const html = generateHTML(image({ layoutMode: "wrapLeft", original: "https://cdn/o.webp", illuminate: recipe }), EXT);
    expect(attrsOf(html)?.illuminate).toEqual(recipe);
  });

  it("writes none of it for a picture that was never treated", () => {
    const html = generateHTML(image({}), EXT);
    expect(html).not.toContain("data-original");
    expect(html).not.toContain("data-illuminate");
    expect(html).not.toContain("data-baked-for");
    expect(attrsOf(html)?.illuminate).toBeNull();
  });

  it("reads a damaged recipe as none rather than failing", () => {
    expect(attrsOf('<img src="https://cdn/a.webp" data-illuminate="{oops">')?.illuminate).toBeNull();
  });
});

describe("ScriptoriumImage pending paint", () => {
  const attrsOf = (html: string) => (generateJSON(html, EXT) as JSONContent).content?.[0].attrs;

  // Fails on: the paint mark not being saved with the chapter, so a reload mid-paint forgets the job and the picture stays empty.
  it("keeps the job and the shape through an HTML round trip, as data attributes only", () => {
    const html = generateHTML(image({ pendingJob: "job-1", pendingShape: "banner" }), EXT);
    expect(html).toContain('data-pending-job="job-1"');
    expect(attrsOf(html)).toMatchObject({ pendingJob: "job-1", pendingShape: "banner" });
  });

  it("writes nothing for a picture that is not being painted", () => {
    const html = generateHTML(image({}), EXT);
    expect(html).not.toContain("data-pending");
  });
});

describe("ScriptoriumImage blend", () => {
  const attrsOf = (html: string) => (generateJSON(html, EXT) as JSONContent).content?.[0].attrs;

  // Fails on: the choice not reaching the markup, so print and a player's copy lose how the picture sits on the paper.
  it("writes the paper blend as data-blend and reads it back, through a wrapper too", () => {
    expect(generateHTML(image({ blend: "paper" }), EXT)).toContain('data-blend="paper"');
    expect(attrsOf(generateHTML(image({ blend: "paper" }), EXT))?.blend).toBe("paper");
    expect(attrsOf(generateHTML(image({ layoutMode: "wrapLeft", blend: "paper" }), EXT))?.blend).toBe("paper");
    expect(attrsOf(generateHTML(image({ blend: "top" }), EXT))?.blend).toBe("top");
  });

  it("writes nothing for a picture that was never given one, and ignores a value that is not a blend", () => {
    expect(generateHTML(image({}), EXT)).not.toContain("data-blend");
    expect(attrsOf('<img src="https://cdn/a.webp" data-blend="screen">')?.blend).toBeNull();
  });
});
