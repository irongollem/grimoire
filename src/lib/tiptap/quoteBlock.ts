import { Node, mergeAttributes } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    quoteBlock: {
      /**
       * Wrap the current block in a Quote callout, or remove the wrapper if the
       * cursor is already inside one.
       */
      toggleQuoteBlock: () => ReturnType;
    };
  }
}

/**
 * Quote callout block — an italic pulled-quote with an optional Attribution
 * child.  No decorative frame; styled via font treatment alone so it works
 * inside a single or two-column layout without visual clutter.
 *
 * 2024 theme: italic body, small-caps attribution in muted accent.
 * Classic theme: same italic body; attribution rendered in red accent colour.
 *
 * A quote without an attribution renders cleanly — there is no dangling em-dash
 * because the dash is emitted by the `.sc-attribution::before` pseudo-element.
 *
 * Accepts `paragraph` and `attribution` children.
 *
 * Styled through CSS custom properties — see ScriptoriumEditor.vue and
 * RENDER_CSS in `useScriptoriumPdf.ts`.
 */
export const QuoteBlock = Node.create({
  name: "quoteBlock",
  group: "block",
  // Allow both regular paragraphs and the attribution line as children
  content: "(paragraph | attribution)+",
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="quoteBlock"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(
        { "data-type": "quoteBlock", class: "sc-quote" },
        HTMLAttributes,
      ),
      0,
    ];
  },

  addCommands() {
    return {
      toggleQuoteBlock:
        () =>
        ({ commands, state }) => {
          const { $from } = state.selection;
          for (let depth = $from.depth; depth > 0; depth--) {
            if ($from.node(depth).type === this.type) {
              return commands.lift(this.name);
            }
          }
          return commands.wrapIn(this.name);
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-Alt-q": () => this.editor.commands.toggleQuoteBlock(),
    };
  },
});
