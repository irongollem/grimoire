// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { spanWideTables, TABLE_SPAN_CLASS } from "./pagedTableFit";
import { sourceIn } from "./pagedSource";

/**
 * jsdom has no layout: the two-column box is given a client width and its
 * column styles inline (658px with a 24px gap, so 317px columns), and each
 * table's first row the width it would lay out at.
 */
function book(tables: Array<{ width: number; inBox?: boolean }>) {
  const markup =
    `<div class="phb-two-col" style="column-count: 2; column-gap: 24px;">` +
    tables
      .map((t, i) =>
        t.inBox
          ? `<div class="sc-note"><table data-ref="t${i}"><tr><td>x</td></tr></table></div>`
          : `<table data-ref="t${i}"><tr><td>x</td></tr></table>`,
      )
      .join("") +
    `</div>`;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = markup;
  const parsed = document.createElement("div");
  parsed.innerHTML = markup;
  Object.defineProperty(wrapper.querySelector(".phb-two-col"), "clientWidth", { value: 658 });
  const placed = Array.from(wrapper.querySelectorAll("table"));
  placed.forEach((table, i) => Object.defineProperty(table.rows[0], "offsetWidth", { value: tables[i].width }));
  return { wrapper, placed, sources: Array.from(parsed.querySelectorAll("table")), sourceOf: sourceIn(parsed) };
}

describe("spanWideTables", () => {
  it("spans a table wider than its column, in the source too (Sothery's faction table, #1115)", () => {
    const { wrapper, placed, sources, sourceOf } = book([{ width: 334 }]);
    spanWideTables(wrapper, sourceOf);
    expect(placed[0].classList.contains(TABLE_SPAN_CLASS)).toBe(true);
    expect(sources[0].classList.contains(TABLE_SPAN_CLASS)).toBe(true);
  });

  it("leaves a table that fits its column", () => {
    const { wrapper, placed, sources, sourceOf } = book([{ width: 317 }]);
    spanWideTables(wrapper, sourceOf);
    expect(placed[0].classList.contains(TABLE_SPAN_CLASS)).toBe(false);
    expect(sources[0].classList.contains(TABLE_SPAN_CLASS)).toBe(false);
  });

  it("tolerates half a pixel of rounding, but spans a table a full pixel over", () => {
    const fits = book([{ width: 317.5 }]);
    spanWideTables(fits.wrapper, fits.sourceOf);
    expect(fits.placed[0].classList.contains(TABLE_SPAN_CLASS)).toBe(false);
    const over = book([{ width: 318 }]);
    spanWideTables(over.wrapper, over.sourceOf);
    expect(over.placed[0].classList.contains(TABLE_SPAN_CLASS)).toBe(true);
  });

  it("measures the column inside the box's padding (the column is narrower than clientWidth / 2)", () => {
    // clientWidth 658 less 2 x 20px padding, less the 24px gap, over 2 columns = 297px.
    const { wrapper, placed } = book([{ width: 310 }]);
    const box = wrapper.querySelector<HTMLElement>(".phb-two-col")!;
    box.style.paddingLeft = "20px";
    box.style.paddingRight = "20px";
    spanWideTables(wrapper);
    expect(placed[0].classList.contains(TABLE_SPAN_CLASS)).toBe(true);
  });

  it("leaves a table broken across both columns, whose own box reports their width", () => {
    const { wrapper, placed } = book([{ width: 317 }]);
    Object.defineProperty(placed[0], "offsetWidth", { value: 658 });
    spanWideTables(wrapper);
    expect(placed[0].classList.contains(TABLE_SPAN_CLASS)).toBe(false);
  });

  it("leaves a table inside a box, which cannot span the page", () => {
    const { wrapper, placed } = book([{ width: 400, inBox: true }]);
    spanWideTables(wrapper);
    expect(placed[0].classList.contains(TABLE_SPAN_CLASS)).toBe(false);
  });
});
