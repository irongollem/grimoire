import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NOTICE_PIN_STYLES } from "@/types/noticeBoard.types";
import {
  BOOK_LOOKS,
  PAPERS,
  handoutDefaults,
  noticePinStyleForPaper,
  bookSurfaceClasses,
  bookSurfaceStyle,
  paperSurfaceStyle,
  scriptoriumThemeClass,
} from "./looks";

// vitest does not process `?inline` CSS, so read the stylesheet the registry
// points at straight from disk.
const css = (name: string) => readFileSync(`src/scriptorium/styles/${name}.css`, "utf8");

describe("scriptorium looks", () => {
  it("every look's stylesheet paints under the class the registry names (a mistyped class would leave the paper unstyled)", () => {
    for (const theme of [...BOOK_LOOKS, ...PAPERS]) {
      const cls = scriptoriumThemeClass(theme);
      expect(cls).toBe(`theme-${theme}`);
      expect(css(`theme-${theme}`)).toContain(`.${cls} {`);
    }
  });

  it("a paper's defaults are one A5 column with no page numbers or footer (a handout is a page, not a book)", () => {
    for (const paper of PAPERS) {
      expect(handoutDefaults(paper)).toEqual({
        page_size: "A5",
        is_two_column: false,
        show_page_numbers: false,
        footer_text: "",
      });
    }
  });

  it("each paper maps to a pin style the notice board accepts", () => {
    for (const paper of PAPERS) {
      expect(NOTICE_PIN_STYLES).toContain(noticePinStyleForPaper(paper));
    }
  });

  it("Grimoire is the first book look, the house look the picker leads with", () => {
    expect(BOOK_LOOKS[0]).toBe("grimoire");
  });

  it("every face the Grimoire look sets text in is registered for the PDF export", () => {
    const fonts = css("fonts");
    const families = [...css("theme-grimoire").matchAll(/--sc-(?:heading|body)-font:\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(families).toEqual(["Cinzel", "Alegreya"]);
    for (const family of families) expect(fonts).toContain(`font-family: "${family}"`);
  });

  it("every face a paper sets text in is registered for the PDF export (it carries fonts.css only)", () => {
    const fonts = css("fonts");
    for (const paper of PAPERS) {
      const families = [...css(`theme-${paper}`).matchAll(/--sc-(?:heading|body)-font:\s*"([^"]+)"/g)].map((m) => m[1]);
      for (const family of families) expect(fonts).toContain(`font-family: "${family}"`);
    }
  });
});

describe("table rows css", () => {
  // Fails on: the 2014 look going back to unstriped rows, or a look missing the stripe colour Striped paints with.
  it("the 2014 look stripes its rows and every look names a stripe", () => {
    expect(css("theme-phb2014")).toMatch(/--sc-table-row-1: #e0e5c1/);
    for (const theme of [...BOOK_LOOKS, ...PAPERS]) expect(css(`theme-${theme}`), theme).toMatch(/--sc-table-stripe: #/);
  });

  // Fails on: Plain losing to a look's own row rule (it must come after, with at least their specificity).
  it("plain and striped rules come after the look's row rules in the base sheet", () => {
    const base = css("theme-base");
    expect(base.indexOf(".sc-table--plain")).toBeGreaterThan(base.indexOf(".theme-onednd2024 table tbody tr:nth-child(odd)"));
    expect(base).toMatch(/\.ink-friendly table\.sc-table--striped[^{]*\{\s*background: transparent/);
  });
});

/** Specificity of a selector made of classes, pseudo-classes and elements (all these stylesheets use): [classes, elements]. */
function specificity(selector: string): number {
  const stripped = selector.replace(/:not\(([^)]*)\)/g, " $1 ");
  const classes = (stripped.match(/\.[\w-]+/g) ?? []).length;
  const elements = (stripped.replace(/\.[\w-]+/g, " ").match(/(?:^|[\s>+~])[a-z][\w-]*/gi) ?? []).length;
  return classes * 100 + elements;
}

/** Every selector of every rule in a stylesheet whose declarations include `needle`. */
function selectorsPainting(source: string, needle: RegExp): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (needle.test(m[2]!)) out.push(...m[1]!.replace(/\/\*[\s\S]*?\*\//g, "").split(",").map((x) => x.trim()));
  }
  return out;
}

describe("bookSurfaceClasses", () => {
  it("adds the paper class to a book look (a missing class leaves the pages the look's colour)", () => {
    expect(bookSurfaceClasses({ theme: "phb2014", paperTone: "grey" })).toEqual(["theme-phb2014", "sc-paper"]);
  });

  it("gives a handout its paper too (a paper chosen in settings must show on the page)", () => {
    // Fails on: the old books-only rule, which dropped a handout's paper.
    expect(bookSurfaceClasses({ theme: "letter", paperTone: "kraft" })).toEqual(["theme-letter", "sc-paper"]);
  });

  it("adds nothing for the look's own paper", () => {
    expect(bookSurfaceClasses({ theme: "grimoire", paperTone: null })).toEqual(["theme-grimoire"]);
    expect(bookSurfaceStyle({ paperTone: null })).toEqual({});
  });

  it("prints plain white in ink-friendly, so a grey book does not spend ink on its grain", () => {
    // Fails on: a paper that survives ink-friendly, in either the class or the style.
    expect(bookSurfaceClasses({ theme: "grimoire", paperTone: "grey", inkFriendly: true })).toEqual(["theme-grimoire"]);
    expect(bookSurfaceStyle({ paperTone: "grey", inkFriendly: true })).toEqual({});
  });

  it("adds the ribbon class only for the ribbon footer", () => {
    expect(bookSurfaceClasses({ theme: "grimoire", footerStyle: "ribbon" })).toContain("sc-footer-style--ribbon");
    expect(bookSurfaceClasses({ theme: "grimoire", footerStyle: "plain" })).toEqual(["theme-grimoire"]);
  });

  it("the paper's style carries its picture, veil, page colour and a physical tile size", () => {
    // Fails on: a tile sized in pixels (a different size in the paged preview than in the painting), or a veil never applied.
    const style = paperSurfaceStyle("kraft");
    expect(style["--sc-paper-image"]).toMatch(/^url\(.*kraft.*\.webp\)$/);
    expect(style["--sc-paper-veil"]).toBe("rgb(255 255 255 / 0.15)");
    expect(style["--sc-page-bg"]).toBe("#ceab86");
    // 1024 px of surface x scale 1.5 on a painted 2480 px A4 page is 86.71 mm x 1.5.
    expect(style["--sc-paper-size"]).toBe("130.06mm 130.06mm");
  });

  it("has CSS for the one paper rule and for the ribbon, each look carrying its ribbon colours", () => {
    const base = css("theme-base");
    expect(base).toContain("var(--sc-paper-image)");
    expect(base).not.toContain("sc-paper--");
    expect(base).toContain(".sc-footer-style--ribbon .sc-footer-text");
    for (const theme of BOOK_LOOKS) expect(css(`theme-${theme}`)).toContain("--sc-ribbon-bg");
  });

  it("the paper rule outranks every look's own page background, and never matches an ink-friendly page", () => {
    // Fails on: a handout theme's gradient (or a book look's texture) painting over the chosen paper, and on a paper
    // that stays on in ink-friendly mode, which must print white.
    const base = css("theme-base");
    const paper = selectorsPainting(base, /var\(--sc-paper-image\)/);
    expect(paper.length).toBe(4);
    for (const selector of paper) expect(selector, selector).toContain(":not(.ink-friendly)");
    // Compared per painted element: a rule only competes with the rules that paint the same one.
    const target = (selector: string) => [".ProseMirror", ".pagedjs_page", ".phb-page", ".sc-paper-surface"].find((t) => selector.includes(t))!;
    const strongestOwn = (name: string, element: string) =>
      Math.max(
        0,
        ...selectorsPainting(css(name), /background(?:-image)?:\s*(?!none|transparent|#fff)/)
          .filter((x) => /(?:\.phb-page|\.pagedjs_page|\.ProseMirror|\.sc-paper-surface[\w.-]*)$/.test(x) && !x.includes("ink-friendly") && target(x) === element)
          .map(specificity),
      );
    for (const theme of [...BOOK_LOOKS, ...PAPERS]) {
      for (const selector of paper) {
        expect(specificity(selector), `${selector} vs ${theme}`).toBeGreaterThan(strongestOwn(`theme-${theme}`, target(selector)));
      }
    }
  });
});
