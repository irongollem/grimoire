import { Node, mergeAttributes } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    attribution: {
      /**
       * Insert an attribution line at the cursor position. Only meaningful inside
       * a quoteBlock — the block registry entry enforces this via `enabled`.
       */
      insertAttribution: () => ReturnType;
    };
  }
}

/**
 * Attribution — an inline child block inside a `quoteBlock` that renders as
 * an em-dash prefixed author/source line in small-caps italic.
 *
 * A quote block with no attribution renders cleanly; the em-dash is supplied
 * by the element's ::before pseudo-element so it never appears when empty.
 *
 * Styled through CSS custom properties — see the shared theme files under
 * `src/assets/scriptorium/`.
 */
export const Attribution = Node.create({
  name: "attribution",
  group: "block",
  content: "inline*",
  defining: true,

  parseHTML() {
    return [{ tag: 'p[data-type="attribution"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "p",
      mergeAttributes(
        { "data-type": "attribution", class: "sc-attribution" },
        HTMLAttributes,
      ),
      0,
    ];
  },

  addCommands() {
    return {
      insertAttribution:
        () =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            content: [],
          });
        },
    };
  },
});
