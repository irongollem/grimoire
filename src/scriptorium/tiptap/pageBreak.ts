import { Node } from "@tiptap/core";

/*
 * PageBreak — explicit "start a new page here" hint (Phase B, #330).
 *
 * Under the old manual-pagination model the preview split content on `<hr>`.
 * Paged.js does the pagination automatically, so a page break is no longer
 * structural — it's an optional override. This node renders to
 * `div.sc-page-break`, which print.css / the paged preview map to
 * `break-before: page`; the galley shows it as a labelled divider.
 *
 * It deliberately does NOT parse `<hr>` — StarterKit's horizontalRule owns
 * that tag. Legacy documents that used `<hr>` as a hard break are converted
 * to pageBreak nodes by the v1→v2 migration (migrations/v1ToV2.ts), so intent
 * is preserved without two nodes fighting over the same tag.
 */

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pageBreak: {
      /** Insert a page break (forces the following content onto a new page). */
      insertPageBreak: () => ReturnType;
    };
  }
}

export const PageBreak = Node.create({
  name: "pageBreak",
  group: "block",
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: 'div[data-type="page-break"]' }];
  },

  renderHTML() {
    return ["div", { "data-type": "page-break", class: "sc-page-break" }];
  },

  addCommands() {
    return {
      insertPageBreak:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: "pageBreak" }),
    };
  },
});
