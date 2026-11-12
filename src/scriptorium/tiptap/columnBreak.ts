import { Node } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    columnBreak: {
      /** Insert a column break (forces end-of-column in two-column layout). */
      insertColumnBreak: () => ReturnType;
    };
  }
}

export const ColumnBreak = Node.create({
  name: "columnBreak",
  group: "block",
  atom: true,
  selectable: false,

  parseHTML() {
    return [{ tag: 'div[data-type="column-break"]' }];
  },

  renderHTML() {
    return ["div", { "data-type": "column-break", class: "sc-column-break" }];
  },

  addCommands() {
    return {
      insertColumnBreak:
        () =>
        ({ commands }) => {
          return commands.insertContent({ type: "columnBreak" });
        },
    };
  },
});
