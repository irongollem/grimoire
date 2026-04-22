import { Node, mergeAttributes } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    spacerHorizontal: {
      /** Insert an inline horizontal spacer with the given width in px. */
      setSpacerHorizontal: (width: number) => ReturnType;
    };
  }
}

/**
 * SpacerHorizontal — inline atom that renders as a zero-height span with a
 * fixed pixel width, suitable for nudging inline content.
 * Editor: shows a dashed outline + label.  Preview/PDF: plain empty space.
 */
export const SpacerHorizontal = Node.create({
  name: "spacerHorizontal",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      width: {
        default: 16,
        parseHTML: (el) => {
          const w = el.getAttribute("data-width");
          return w ? parseInt(w, 10) : 16;
        },
        renderHTML: (attrs) => ({ "data-width": String(attrs.width) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="spacer-h"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(
        {
          "data-type": "spacer-h",
          class: "sc-spacer-h",
          style: `display:inline-block;width:${node.attrs.width as number}px`,
        },
        HTMLAttributes,
      ),
    ];
  },

  addCommands() {
    return {
      setSpacerHorizontal:
        (width: number) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { width },
          }),
    };
  },
});
