import { Node, mergeAttributes } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    descriptiveBlock: {
      /**
       * Wrap the current block in a Descriptive (read-aloud) callout, or remove
       * the wrapper if the cursor is already inside one.
       */
      toggleDescriptiveBlock: () => ReturnType;
    };
  }
}

/**
 * Descriptive (read-aloud) callout block — the large framed box used for
 * prose that is read aloud to players.
 *
 * 2024 theme: flat, slightly darker teal box with generous padding.
 * Classic theme: framed parchment with a thicker accent border.
 *
 * Styled entirely through CSS custom properties — see ScriptoriumEditor.vue
 * (scoped `<style>`) and RENDER_CSS in `useScriptoriumPdf.ts` for both themes.
 */
export const DescriptiveBlock = Node.create({
  name: "descriptiveBlock",
  group: "block",
  content: "block+",
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="descriptiveBlock"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(
        { "data-type": "descriptiveBlock", class: "sc-descriptive" },
        HTMLAttributes,
      ),
      0,
    ];
  },

  addCommands() {
    return {
      toggleDescriptiveBlock:
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
      "Mod-Alt-d": () => this.editor.commands.toggleDescriptiveBlock(),
    };
  },
});
