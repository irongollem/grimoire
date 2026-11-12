import { Extension } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    dropCap: {
      /** Sets the first letter of the paragraph at the caret large, or takes it off again. */
      toggleDropCap: () => ReturnType;
    };
  }
}

/**
 * A drop cap is a flag on the paragraph, drawn by every look's CSS with
 * `::first-letter` (theme-base.css), so the page you write on and the PDF
 * draw the same letter. Nothing in the text changes: take the flag off and
 * the paragraph is plain again.
 */
export const DropCap = Extension.create({
  name: "dropCap",

  addGlobalAttributes() {
    return [
      {
        types: ["paragraph"],
        attributes: {
          dropCap: {
            default: false,
            parseHTML: (el) => el.classList.contains("sc-drop-cap"),
            renderHTML: (attrs) => (attrs.dropCap ? { class: "sc-drop-cap" } : {}),
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      toggleDropCap:
        () =>
        ({ state, tr, dispatch }) => {
          const { $from } = state.selection;
          for (let depth = $from.depth; depth > 0; depth--) {
            const node = $from.node(depth);
            if (node.type.name !== "paragraph") continue;
            if (dispatch) {
              tr.setNodeMarkup($from.before(depth), undefined, { ...node.attrs, dropCap: !node.attrs.dropCap });
              dispatch(tr);
            }
            return true;
          }
          return false;
        },
    };
  },
});
