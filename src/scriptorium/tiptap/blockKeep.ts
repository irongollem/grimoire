import { Extension } from "@tiptap/core";

/** The blocks that can be kept whole on one page: the ones the book kit and the panel offer it for. */
export const KEEPABLE_BLOCKS = [
  "descriptiveBlock",
  "noteBlock",
  "quoteBlock",
  "wideBlock",
  "blockquote",
  "table",
] as const;

/**
 * "Keep on one page" (#1176 frame 13): a flag on a box or table that stops the
 * page from splitting it. It renders as `data-keep`, which theme-base.css turns
 * into `break-inside: avoid` for the page you write on, the preview and the PDF
 * alike, and which wins over the layout's own "a very long box may break" call.
 */
export const BlockKeep = Extension.create({
  name: "blockKeep",

  addGlobalAttributes() {
    return [
      {
        types: [...KEEPABLE_BLOCKS],
        attributes: {
          keepTogether: {
            default: false,
            parseHTML: (el) => el.getAttribute("data-keep") === "true",
            renderHTML: (attrs) => (attrs.keepTogether ? { "data-keep": "true" } : {}),
          },
        },
      },
    ];
  },
});
