// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectedPagesFromDom } from "./printCheckDom";

describe("expectedPagesFromDom", () => {
  it("reads the content apart from the footer and furniture", () => {
    const el = document.createElement("div");
    el.className = "pagedjs_page";
    el.innerHTML =
      `<div class="pagedjs_pagebox"><div class="pagedjs_area"><div class="pagedjs_page_content"><p>Hello world</p></div></div>` +
      `<div class="sc-footer"><span>7</span><span>The Book</span><span>7</span></div></div>` +
      `<div class="sc-furniture">Corner</div>`;
    const [read] = expectedPagesFromDom([el], ["7"]);
    expect(read).toEqual({ index: 0, label: "7", text: "Hello world", ignorable: ["7", "The Book", "7", "Corner"] });
  });

  describe("when the page has a layout", () => {
    afterEach(() => vi.restoreAllMocks());

    function rect(left: number, top: number, right: number, bottom: number): DOMRect {
      return { left, top, right, bottom, width: right - left, height: bottom - top, x: left, y: top } as DOMRect;
    }

    it("holds the PDF to the lines the page shows, not to lines Paged.js left past its edge", () => {
      const el = document.createElement("div");
      el.className = "pagedjs_page";
      el.innerHTML =
        `<div class="pagedjs_page_content"><p>Seen words</p><p>Third column words</p></div>`;
      const content = el.querySelector(".pagedjs_page_content")!;
      vi.spyOn(content, "getBoundingClientRect").mockReturnValue(rect(0, 0, 200, 300));
      // Each text node is one line here: the second sits in a column beyond the page.
      vi.spyOn(Range.prototype, "getClientRects").mockImplementation(function (this: Range) {
        const text = this.toString();
        const box = text.startsWith("Third") ? rect(400, 10, 500, 30) : rect(10, 10, 100, 30);
        return [box] as unknown as DOMRectList;
      });
      const [read] = expectedPagesFromDom([el], [null]);
      expect(read.text).toContain("Seen words");
      expect(read.text).not.toContain("Third column words");
    });
  });
});
