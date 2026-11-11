import { Node } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    resetCounting: {
      /** Insert a reset-counting marker: resets the running page counter back to pageNumberStart from this page onwards. */
      insertResetCounting: () => ReturnType;
    };
  }
}

/**
 * ResetCounting — block-level atom node that resets the running page counter
 * back to `pageNumberStart` from this page onwards.  Useful after a cover page
 * or unnumbered front-matter section.
 *
 * Editor: renders as a small labelled chip ("reset to 1").
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

  addCommands() {
    return {
      insertResetCounting:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: this.name }),
    };
  },
});
