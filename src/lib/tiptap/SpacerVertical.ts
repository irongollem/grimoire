import { Node, mergeAttributes } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    spacerVertical: {
      /** Insert a vertical spacer with the given height in px. */
      setSpacerVertical: (height: number) => ReturnType;
    };
  }
}

/**
 * SpacerVertical — block-level atom that renders as an empty div with a fixed
 * pixel height.  Editor: shows a dashed outline + label.  Preview/PDF: plain
 * empty space (no border, no label).
 */
export const SpacerVertical = Node.create({
  name: "spacerVertical",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      height: {
        default: 16,
        parseHTML: (el) => {
          const h = el.getAttribute("data-height");
          return h ? parseInt(h, 10) : 16;
        },
        renderHTML: (attrs) => ({ "data-height": String(attrs.height) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="spacer-v"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(
        {
          "data-type": "spacer-v",
          class: "sc-spacer-v",
          style: `height:${node.attrs.height as number}px`,
        },
        HTMLAttributes,
      ),
    ];
  },

  addCommands() {
    return {
      setSpacerVertical:
        (height: number) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { height },
          }),
    };
  },
});
