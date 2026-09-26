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
    // Explicit priority: StarterKit's Paragraph also matches any bare `<p>`
    // at the schema's default priority (50), and — being registered first in
    // createScriptoriumExtensions() — wins ties over this more specific
    // selector, so an attribution paragraph silently parsed back as an
    // ordinary one on any HTML-string round trip (found via the #915 story 2
    // node round-trip tests). A higher priority makes this rule run first.
    return [{ tag: 'p[data-type="attribution"]', priority: 51 }];
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
