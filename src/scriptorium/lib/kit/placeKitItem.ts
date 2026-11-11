/*
 * Puts a kit item on the page (#1176 frame 13), from a click, a drop or the "/"
 * menu. Every block action in the registry works on the caret, so the item is
 * given an empty line to land on first: at the caret's block for a click, at
 * the drop line for a drop, in place for "/". Nothing splits a paragraph the
 * writer was in the middle of.
 */
import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { findBlockEntry } from "@/scriptorium/lib/blockRegistry";
import type { KitItem } from "@/scriptorium/lib/kit/kitItem";

/** The caret sits in an empty paragraph already. */
function onEmptyLine(editor: Editor): boolean {
  const { $from, empty } = editor.state.selection;
  return empty && $from.depth >= 1 && $from.parent.type.name === "paragraph" && $from.parent.content.size === 0;
}

/** Where a new top-level block goes after the one the caret is in. */
function boundaryAfterCaret(editor: Editor): number {
  const { $to } = editor.state.selection;
  return $to.depth >= 1 ? $to.after(1) : $to.pos;
}

/** Puts an empty paragraph at a top-level boundary and the caret in it. */
function openLineAt(editor: Editor, boundary: number): void {
  const { state, view } = editor;
  const paragraph = state.schema.nodes.paragraph.create();
  const tr = state.tr.insert(boundary, paragraph);
  tr.setSelection(TextSelection.create(tr.doc, boundary + 1));
  view.dispatch(tr);
}

export interface PlaceContext {
  /** A top-level boundary to land on (a drop); the caret's own block when left out. */
  at?: number;
  /** The document position under the pointer (a drop), where an entry that works on the text lands. */
  pointer?: number;
  /** Whether the book is in two columns, for entries that only apply there. */
  isTwoColumn?: boolean;
}

/** Inserts `item`; false when it names a block that does not exist or is not allowed here. */
export function placeKitItem(editor: Editor, item: KitItem, ctx: PlaceContext = {}): boolean {
  if (editor.isDestroyed) return false;
  if (item.kind === "block") {
    const entry = findBlockEntry(item.label);
    if (!entry?.action) return false;
    if (entry.enabled && !entry.enabled(editor, { isTwoColumn: ctx.isTwoColumn })) return false;
  }
  const inPlace = item.kind === "block" && findBlockEntry(item.label)?.inPlace === true;
  if (inPlace) {
    if (ctx.pointer !== undefined) {
      const { state, view } = editor;
      view.dispatch(state.tr.setSelection(TextSelection.near(state.doc.resolve(ctx.pointer))));
    }
  } else if (ctx.at !== undefined) openLineAt(editor, ctx.at);
  else if (!onEmptyLine(editor)) openLineAt(editor, boundaryAfterCaret(editor));

  if (item.kind === "block") {
    findBlockEntry(item.label)?.action?.(editor);
    return true;
  }
  if (item.kind === "art") {
    return editor.chain().focus().setImage({ src: item.src }).run();
  }
  return editor
    .chain()
    .focus()
    .insertContent({
      type: "entityEmbed",
      // Only a monster starts its own page by default, like a Monster Manual entry;
      // the node's own schema default is unconditionally true, so it is set here.
      attrs: { entityType: item.entityType, entityId: item.entityId, startsPage: item.entityType === "monster" },
    })
    .run();
}
