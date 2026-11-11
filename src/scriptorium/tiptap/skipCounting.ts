import { Node } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    skipCounting: {
      /** Insert a skip-counting marker: this page's number is omitted and the counter does not advance. */
      insertSkipCounting: () => ReturnType;
    };
  }
}

/**
 * SkipCounting — block-level atom node that marks a page so its page number
 * is omitted from the footer and the running counter does NOT advance.
 *
 * Editor: renders as a small labelled chip ("skip #").
 * Preview/PDF: renders as an invisible marker div (zero height).
 */
export const SkipCounting = Node.create({
  name: "skipCounting",
  group: "block",
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: 'div[data-type="skip-counting"]' }];
  },

  renderHTML() {
    return [
      "div",
      { "data-type": "skip-counting", class: "sc-skip-counting" },
    ];
  },

  addCommands() {
    return {
      insertSkipCounting:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: this.name }),
    };
  },
});
