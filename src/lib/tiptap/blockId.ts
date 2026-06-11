/*
 * BlockId — stable UUID identity for top-level blocks.
 *
 * Every block in the content stream carries a persistent `data-block-id`
 * attribute. This is re-architecture groundwork (SCRIPTORIUM_PLAN.md):
 *   - Phase B: click-to-edit mapping between the Paged.js-rendered book and
 *     the galley (Paged.js preserves attributes when fragmenting the DOM, so
 *     a click in the book resolves to a ProseMirror position via the id).
 *   - Phase D: page-furniture anchors (`{ type: "block", blockId }`) that
 *     keep decorations attached to the page their content lands on.
 *
 * IDs are assigned by an appendTransaction plugin whenever a block is missing
 * one or duplicates another (paste/duplicate). `keepOnSplit: false` ensures
 * the second half of a split block gets a fresh id.
 */

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { Transaction } from "@tiptap/pm/state";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

export interface BlockIdOptions {
  /** Node type names that carry a block id. */
  types: string[];
}

/** Node types that participate in block identity (top-level content blocks). */
export const BLOCK_ID_TYPES = [
  "paragraph",
  "heading",
  "blockquote",
  "bulletList",
  "orderedList",
  "codeBlock",
  "table",
  "image",
  "wideBlock",
  "noteBlock",
  "descriptiveBlock",
  "quoteBlock",
  "tocBlock",
  "coverPage",
  "watermark",
  "artistCredit",
  "spacerVertical",
] as const;

/**
 * Build a transaction assigning fresh UUIDs to every typed block whose id is
 * missing or duplicates an earlier block's (paste/duplicate). Returns null
 * when every block already has a unique id.
 */
function assignMissingBlockIds(
  state: { doc: ProseMirrorNode; tr: Transaction },
  types: ReadonlySet<string>,
): Transaction | null {
  const seen = new Set<string>();
  let tr: Transaction | null = null;
  state.doc.descendants((node, pos) => {
    if (!types.has(node.type.name)) return true;
    const id: unknown = node.attrs.blockId;
    if (typeof id !== "string" || !id || seen.has(id)) {
      tr ??= state.tr;
      tr.setNodeAttribute(pos, "blockId", crypto.randomUUID());
    } else {
      seen.add(id);
    }
    return true;
  });
  return tr;
}

export const BlockId = Extension.create<BlockIdOptions>({
  name: "blockId",

  addOptions() {
    return { types: [...BLOCK_ID_TYPES] };
  },

  onCreate() {
    // appendTransaction only runs on edits — a freshly loaded document needs
    // its ids straight away (the preview/book mapping reads them on render).
    const tr = assignMissingBlockIds(this.editor.state, new Set(this.options.types));
    if (tr) this.editor.view.dispatch(tr);
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          blockId: {
            default: null,
            keepOnSplit: false,
            parseHTML: (el: HTMLElement) => el.getAttribute("data-block-id"),
            renderHTML: (attrs: { blockId?: string | null }) =>
              attrs.blockId ? { "data-block-id": attrs.blockId } : {},
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    const types = new Set(this.options.types);
    return [
      new Plugin({
        key: new PluginKey("blockIdAssign"),
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((tr) => tr.docChanged)) return null;
          return assignMissingBlockIds(newState, types);
        },
      }),
    ];
  },
});
