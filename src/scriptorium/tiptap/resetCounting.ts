import { Node } from "@tiptap/core";

/**
 * ResetCounting — block-level atom node that resets the running page counter
 * back to `pageNumberStart` from this page onwards.  Useful after a cover page
 * or unnumbered front-matter section.
 *
 * The DM sets it from the page's footer ("Start the count again here"), not
 * as a chip in the text (#1176 story 6).
 * Preview/PDF: renders as an invisible marker div (zero height).
 */
export const ResetCounting = Node.create({
  name: "resetCounting",
  group: "block",
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: 'div[data-type="reset-counting"]' }];
  },

  renderHTML() {
    return [
      "div",
      { "data-type": "reset-counting", class: "sc-reset-counting" },
    ];
  },
});
