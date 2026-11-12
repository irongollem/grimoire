import { Extension, Node, type Editor } from "@tiptap/core";
import type { ResolvedPos } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { canSplit } from "@tiptap/pm/transform";

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

function inTable($pos: ResolvedPos): boolean {
  for (let d = $pos.depth; d > 0; d--) if ($pos.node(d).type.spec.tableRole) return true;
  return false;
}

/**
 * Break the page at the caret: what follows the caret starts the next page,
 * and the caret goes with it.
 *
 * A break always sits between top-level blocks, never inside a box, a quote
 * or a list: a break inside one left the box's empty frame at the foot of one
 * page and its text on the next. So the caret's place is first widened to the
 * edge of what it is at the edge of (the start of a box's first paragraph is
 * the start of the box, which then moves to the next page whole), and anything
 * still around it is split there, so a box broken in its middle becomes two
 * whole boxes and a numbered list carries on counting. At the end of a block
 * the next page opens on a new empty paragraph, as in a word processor.
 *
 * Declines (false) outside a text block, in code and in a table (a cell cannot
 * be split across pages), so the key keeps its usual meaning there.
 */
export function breakPageHere(editor: Editor): boolean {
  if (!editor.isEditable) return false;
  const { $from } = editor.state.selection;
  if (!$from.parent.isTextblock || $from.parent.type.spec.code) return false;
  return editor
    .chain()
    .command(({ tr, state }) => {
      // Not the deleteSelection command: it answers false on an empty
      // selection, which fails the chain and lets the hard break run too.
      if (!tr.selection.empty) tr.deleteSelection();
      let $pos = tr.selection.$from;
      while ($pos.depth > 0 && $pos.parentOffset === 0) $pos = tr.doc.resolve($pos.before());
      const atEnd = $pos.depth > 0 && $pos.parentOffset === $pos.parent.content.size;
      while ($pos.depth > 0 && $pos.parentOffset === $pos.parent.content.size) $pos = tr.doc.resolve($pos.after());
      if (inTable($pos)) return false;

      const depth = $pos.depth;
      if (depth > 0) {
        if (!canSplit(tr.doc, $pos.pos, depth)) return false;
        tr.split($pos.pos, depth);
        // The second half of a numbered list starts where the first half stopped.
        const secondHalf = $pos.pos + depth;
        let inner = secondHalf;
        for (let d = 1; d <= depth; d++) {
          const original = $pos.node(d);
          if (original.type.name === "orderedList") {
            const start = typeof original.attrs.start === "number" ? original.attrs.start : 1;
            tr.setNodeMarkup(inner, undefined, { ...original.attrs, start: start + $pos.indexAfter(d) });
          }
          inner += 1; // into the first child of the half at this depth
        }
        tr.insert(secondHalf, state.schema.nodes.pageBreak.create());
        tr.setSelection(TextSelection.near(tr.doc.resolve(secondHalf + 1)));
        return true;
      }

      const at = $pos.pos;
      if (atEnd) {
        tr.insert(at, [state.schema.nodes.pageBreak.create(), state.schema.nodes.paragraph.create()]);
        tr.setSelection(TextSelection.create(tr.doc, at + 2));
      } else {
        tr.insert(at, state.schema.nodes.pageBreak.create());
        tr.setSelection(TextSelection.near(tr.doc.resolve(at + 1)));
      }
      return true;
    })
    .scrollIntoView()
    .run();
}

/**
 * Ctrl+Enter (Cmd+Enter on a Mac, where Ctrl+Enter works too) breaks the
 * page, as in a word processor. A separate extension at a higher priority than
 * StarterKit's hard break, which also claims Mod-Enter: raising the node's own
 * priority would move it ahead of the paragraph in the schema and change what
 * an empty block is filled with.
 */
export const PageBreakKeys = Extension.create({
  name: "pageBreakKeys",
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      "Mod-Enter": () => breakPageHere(this.editor),
      "Ctrl-Enter": () => breakPageHere(this.editor),
    };
  },
});
