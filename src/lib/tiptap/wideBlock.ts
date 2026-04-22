import { Node, mergeAttributes } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    wideBlock: {
      /** Wrap selected blocks in a wide block that spans both columns, or lift out if already inside one. */
      toggleWideBlock: () => ReturnType;
    };
  }
}

export const WideBlock = Node.create({
  name: "wideBlock",
  group: "block",
  content: "block+",

  parseHTML() {
    return [{ tag: 'div[data-type="wide-block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes({ "data-type": "wide-block", class: "sc-wide" }, HTMLAttributes),
      0,
    ];
  },

  addCommands() {
    return {
      toggleWideBlock:
        () =>
        ({ editor, commands }) => {
          if (editor.isActive("wideBlock")) {
            return commands.lift("wideBlock");
          }
          return commands.wrapIn("wideBlock");
        },
    };
  },
});
