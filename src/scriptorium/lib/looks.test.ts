import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NOTICE_PIN_STYLES } from "@/types/noticeBoard.types";
import {
  BOOK_LOOKS,
  PAPERS,
  handoutDefaults,
  noticePinStyleForPaper,
  PAPER_CHOICES,
  bookSurfaceClasses,
  paperToneFromChoice,
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

describe("bookSurfaceClasses", () => {
  it("adds the paper class to a book look (a missing class leaves the pages the look's colour)", () => {
    expect(bookSurfaceClasses({ theme: "phb2014", paperTone: "grey" })).toEqual(["theme-phb2014", "sc-paper--grey"]);
  });

  it("never gives a handout a book paper: its paper is its theme", () => {
    expect(bookSurfaceClasses({ theme: "letter", paperTone: "grey" })).toEqual(["theme-letter"]);
  });

  it("adds nothing for the look's own paper", () => {
    expect(bookSurfaceClasses({ theme: "grimoire", paperTone: null })).toEqual(["theme-grimoire"]);
  });

  it("prints plain white in ink-friendly, so a grey book does not spend ink on its grain", () => {
    expect(bookSurfaceClasses({ theme: "grimoire", paperTone: "grey", inkFriendly: true })).toEqual(["theme-grimoire"]);
  });

  it("adds the ribbon class only for the ribbon footer", () => {
    expect(bookSurfaceClasses({ theme: "grimoire", footerStyle: "ribbon" })).toContain("sc-footer-style--ribbon");
    expect(bookSurfaceClasses({ theme: "grimoire", footerStyle: "plain" })).toEqual(["theme-grimoire"]);
  });

  it("round-trips the paper choice through the control's values, null being the look's own", () => {
    expect(PAPER_CHOICES.map((c) => paperToneFromChoice(c.value))).toEqual([null, "grey", "white", "parchment"]);
  });

  it("has CSS for every paper and for the ribbon, each look carrying its ribbon colours", () => {
    const base = css("theme-base");
    for (const tone of ["grey", "white", "parchment"]) expect(base).toContain(`.sc-paper--${tone} {`);
    expect(base).toContain(".sc-footer-style--ribbon .sc-footer-text");
    for (const theme of BOOK_LOOKS) expect(css(`theme-${theme}`)).toContain("--sc-ribbon-bg");
  });
});
