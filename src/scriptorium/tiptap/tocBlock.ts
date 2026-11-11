import { Node, mergeAttributes } from "@tiptap/core";
import { VueNodeViewRenderer } from "@tiptap/vue-3";
import ContentsView from "@/scriptorium/components/ContentsView.vue";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    tocBlock: {
      insertTocBlock: () => ReturnType;
    };
  }
}

/**
 * Table of Contents block — atom node that acts as a live TOC placeholder.
 *
 * In the book it stays an empty `<nav data-type="toc">` placeholder in the
 * stored HTML; before Paged.js layout `expandTocPlaceholder`
 * (src/scriptorium/lib/pagedToc.ts) replaces it with the full list and after it
 * the heading page numbers are filled in. In the editor the page draws that same
 * list (ContentsView.vue), read from the layout, so the contents page is as tall
 * on the sheet as it prints.
 */
export const TocBlock = Node.create({
  name: "tocBlock",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  parseHTML() {
    return [{ tag: 'nav[data-type="toc"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "nav",
      mergeAttributes({ "data-type": "toc", class: "sc-toc-placeholder" }, HTMLAttributes),
      // Text content shown only in the editor via CSS ::after
    ];
  },

  addNodeView() {
    return VueNodeViewRenderer(ContentsView);
  },

  addCommands() {
    return {
      insertTocBlock:
        () =>
        ({ commands }) => {
          return commands.insertContent({ type: this.name });
        },
    };
  },
});
