import { Node } from "@tiptap/core";

/**
 * SkipCounting — block-level atom node that marks a page so its page number
 * is omitted from the footer and the running counter does NOT advance.
 *
 * It is the stored form of two choices on the page (#1176 story 6): "No footer
 * on this page" (the default) and "Don't count this page" (`keepFooter`: the
 * number is left off and the count does not advance, but the running title
 * stays). The DM sees neither as a chip; the page's footer shows what it does.
 * Preview/PDF: renders as an invisible marker div (zero height).
 */
export const SkipCounting = Node.create({
  name: "skipCounting",
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      keepFooter: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-keep-footer") === "true",
        // Absent when false, so a book saved before this choice existed reads the same.
        renderHTML: (attrs) => (attrs.keepFooter === true ? { "data-keep-footer": "true" } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="skip-counting"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", { "data-type": "skip-counting", class: "sc-skip-counting", ...HTMLAttributes }];
  },
});
