import { Node, mergeAttributes } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    columns: {
      /** Wrap selected blocks in a two-column container, or lift out if already inside one. */
      toggleColumns: () => ReturnType;
    };
  }
}

export const Columns = Node.create({
  name: "columns",
  group: "block",
  content: "block+",

  parseHTML() {
    return [{ tag: 'div[data-type="columns"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes({ "data-type": "columns" }, HTMLAttributes), 0];
  },

  addCommands() {
    return {
      toggleColumns:
        () =>
        ({ editor, commands }) => {
          if (editor.isActive("columns")) {
            return commands.lift("columns");
          }
          return commands.wrapIn("columns");
        },
    };
  },
});
