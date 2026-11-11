/*
 * What is selected, as one answer (#1176, Scriptorium One Surface).
 *
 * The panel beside the page describes the selection, or the page when nothing
 * is. The selection lives in two places that never knew each other: the
 * editor's own (a picture, a cover or a linked entry is a node the DM selects
 * in the text) and the shell's (a picture or decoration placed on the page is
 * furniture with a selected id). This reads both and answers once; deciding
 * which wins is `deriveSelection`, kept pure.
 */
import { computed, onBeforeUnmount, ref, watch, type Ref } from "vue";
import type { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { pageAt, type PageFlowStorage } from "@/scriptorium/tiptap/pageFlow";
import type { FurnitureKind } from "@/scriptorium/types";

export type PanelSelection =
  | { kind: "page"; page: number | null }
  | { kind: "picture"; source: "node"; pos: number }
  | { kind: "picture"; source: "furniture"; id: string }
  | { kind: "decoration"; id: string }
  | { kind: "cover"; pos: number }
  | { kind: "embed"; pos: number };

export interface SelectionInputs {
  /** The editor's selected node, when the selection is a whole node. */
  node: { name: string; pos: number } | null;
  /** The cover page the cursor is in, when it is in one. */
  coverPos: number | null;
  /** The selected furniture, when one is. */
  furniture: { id: string; kind: FurnitureKind } | null;
  /** The page of the open chapter the caret is on. */
  page: number | null;
}

/**
 * A picture placed on the page is what the DM last pressed, so it wins over a
 * node the text still has selected; after that a selected node, then a cursor
 * in a cover, then the page.
 */
export function deriveSelection(input: SelectionInputs): PanelSelection {
  const { furniture, node } = input;
  if (furniture) {
    return furniture.kind === "art"
      ? { kind: "picture", source: "furniture", id: furniture.id }
      : { kind: "decoration", id: furniture.id };
  }
  if (node?.name === "image") return { kind: "picture", source: "node", pos: node.pos };
  if (node?.name === "entityEmbed") return { kind: "embed", pos: node.pos };
  if (node?.name === "coverPage") return { kind: "cover", pos: node.pos };
  if (input.coverPos !== null) return { kind: "cover", pos: input.coverPos };
  return { kind: "page", page: input.page };
}

/** A stable string for a selection, to tell "the same thing" from "something else". */
export function selectionKey(s: PanelSelection): string {
  switch (s.kind) {
    case "page":
      return "page";
    case "picture":
      return s.source === "node" ? `picture:node:${s.pos}` : `picture:furniture:${s.id}`;
    case "decoration":
      return `decoration:${s.id}`;
    default:
      return `${s.kind}:${s.pos}`;
  }
}

function coverAround(ed: Editor): number | null {
  const { $from } = ed.state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type.name === "coverPage") return $from.before(depth);
  }
  return null;
}

export function useScriptoriumSelection(opts: {
  editor: Ref<Editor | undefined>;
  /** The selected furniture, as the shell holds it. */
  furniture: () => { id: string; kind: FurnitureKind } | null;
}) {
  // Bumped on every transaction and every new layout: the editor is not reactive, these are its change signals.
  const version = ref(0);
  const bump = () => {
    version.value++;
  };

  let attached: { ed: Editor; flow: PageFlowStorage | undefined } | null = null;
  function detach() {
    if (!attached) return;
    attached.ed.off("transaction", bump);
    attached.flow?.listeners.delete(bump);
    attached = null;
  }
  watch(
    opts.editor,
    (ed) => {
      detach();
      if (!ed) return;
      const flow = (ed.storage as unknown as { pageFlow?: PageFlowStorage }).pageFlow;
      ed.on("transaction", bump);
      flow?.listeners.add(bump);
      attached = { ed, flow };
      bump();
    },
    { immediate: true },
  );
  onBeforeUnmount(detach);

  const selection = computed<PanelSelection>(() => {
    void version.value;
    const ed = opts.editor.value;
    if (!ed || ed.isDestroyed) return { kind: "page", page: null };
    const sel = ed.state.selection;
    const pages = (ed.storage as unknown as { pageFlow?: PageFlowStorage }).pageFlow?.pages ?? [];
    return deriveSelection({
      node: sel instanceof NodeSelection ? { name: sel.node.type.name, pos: sel.from } : null,
      coverPos: coverAround(ed),
      furniture: opts.furniture(),
      page: pageAt(pages, sel.from)?.page ?? null,
    });
  });

  return { selection, version };
}
