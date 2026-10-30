import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NOTICE_PIN_STYLES } from "@/types/noticeBoard.types";
import {
  BOOK_LOOKS,
  PAPERS,
  handoutDefaults,
  noticePinStyleForPaper,
  scriptoriumThemeClass,
} from "./looks";

// vitest does not process `?inline` CSS, so read the stylesheet the registry
// points at straight from disk.
const css = (name: string) => readFileSync(`src/assets/scriptorium/${name}.css`, "utf8");

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

  it("every face a paper sets text in is registered for the PDF export (it carries fonts.css only)", () => {
    const fonts = css("fonts");
    for (const paper of PAPERS) {
      const families = [...css(`theme-${paper}`).matchAll(/--sc-(?:heading|body)-font:\s*"([^"]+)"/g)].map((m) => m[1]);
      for (const family of families) expect(fonts).toContain(`font-family: "${family}"`);
    }
  });
});
