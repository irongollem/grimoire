/*
 * Wrapped-image grouping for the Paged.js book (#915, 27 Sep 2026).
 *
 * A wrapped image (`.sc-img-wrap--wrapLeft/-wrapRight`, a float) sits BEFORE
 * the paragraph that runs beside it. When the float is taller than what is
 * left of a column, the browser moves the float to the next column and lets
 * the paragraph carry on where it was: the text starts at the foot of one
 * column with no picture, and the picture turns up at the head of the next
 * beside the text's last lines. That is what happened to Rosie's portrait in
 * the Sugarwell booklet's Appendix C, the one entry of five whose portrait
 * landed beside another entry's words.
 *
 * groupWrappedImages() wraps the float, a short paragraph after it, and a
 * heading directly before it in one `.sc-float-group`, which pagedPreviewCss.ts
 * keeps unbroken, so an entry that does not fit moves to the next column
 * whole, the way a book sets a portrait with its caption text. It runs on the
 * HTML string before Paged.js lays the page out, the same timing as
 * pagedBoxes.ts.
 */

/**
 * Only a caption-length paragraph travels with its picture. Kept together, a
 * group that misses the space left in a column moves on whole and leaves that
 * space blank, which is a fair price for a character card but not for a
 * section of running prose. Measured on the Sugarwell booklet: the five
 * pregenerated characters run 265 to 353 characters beside a portrait about
 * 210px tall, and each group is barely taller than its picture; the location
 * sections run 388 to 593 characters, their groups reach half a column, and
 * grouping them pushed Masters' Lane onto a new page and left a third of the
 * one before it empty. 360 sits between the two.
 */
export const FLOAT_GROUP_CHAR_THRESHOLD = 360;

const WRAPPED_IMAGE = ".sc-img-wrap--wrapLeft, .sc-img-wrap--wrapRight";
const HEADING = /^H[1-6]$/;

function textLength(el: Element): number {
  return (el.textContent ?? "").replace(/\s+/g, " ").trim().length;
}

/**
 * Wrap each wrapped image with the paragraph after it (and a heading directly
 * before it) in a `.sc-float-group`, in place. No-op when the html has no
 * wrapped image.
 */
export function groupWrappedImages(html: string): string {
  if (!html.includes("sc-img-wrap--wrap")) return html;
  const container = document.createElement("div");
  container.innerHTML = html;
  container.querySelectorAll(WRAPPED_IMAGE).forEach((float) => {
    const paragraph = float.nextElementSibling;
    if (!paragraph || paragraph.tagName !== "P") return;
    if (textLength(paragraph) > FLOAT_GROUP_CHAR_THRESHOLD) return;
    const before = float.previousElementSibling;
    const heading = before && HEADING.test(before.tagName) ? before : null;
    const group = document.createElement("div");
    group.className = "sc-float-group";
    float.before(group);
    if (heading) group.append(heading);
    group.append(float, paragraph);
  });
  return container.innerHTML;
}
