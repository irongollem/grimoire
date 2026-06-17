import { Node, mergeAttributes } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    noteBlock: {
      /**
       * Wrap the current block in a Note callout, or remove the wrapper if the
       * cursor is already inside one.
       */
      toggleNoteBlock: () => ReturnType;
    };
  }
}

/**
 * Note callout block — a boxed highlight for rules reminders, DM tips, or
 * important asides.
 *
 * 2024 theme: teal-tinted rounded rect with 1 px accent left border.
 * Classic theme: parchment-olive background with a top/bottom double rule.
 *
 * Styled entirely through CSS custom properties — see the shared theme files
 * under `src/assets/scriptorium/` (single source of truth for both themes).
 */
export const NoteBlock = Node.create({
  name: "noteBlock",
  group: "block",
  content: "block+",
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="noteBlock"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes({ "data-type": "noteBlock", class: "sc-note" }, HTMLAttributes),
      0,
    ];
  },

  addCommands() {
    return {
      toggleNoteBlock:
        () =>
        ({ commands, state }) => {
          const { $from } = state.selection;
          // Walk ancestors to find if we're inside a noteBlock
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
      "Mod-Alt-n": () => this.editor.commands.toggleNoteBlock(),
    };
  },
});
