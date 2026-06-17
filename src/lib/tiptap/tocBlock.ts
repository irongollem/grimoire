import { Node, mergeAttributes } from "@tiptap/core";

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
 * In the galley it renders a dashed box labelled "Table of Contents". In the
 * book it stays an empty `<nav data-type="toc">` placeholder until, after
 * Paged.js layout, `injectPagedToc` (src/lib/scriptorium/pagedToc.ts) walks the
 * rendered pages, maps each heading to its physical page's footer number, and
 * replaces the placeholder with a rendered `<nav class="sc-toc">`.
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
