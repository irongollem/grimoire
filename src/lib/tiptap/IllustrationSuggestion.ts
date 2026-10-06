import { Node, mergeAttributes } from "@tiptap/core";
import type { Node as PmNode } from "@tiptap/pm/model";
import { VueNodeViewRenderer } from "@tiptap/vue-3";
import IllustrationSuggestionNodeView from "@/components/tiptap/IllustrationSuggestionNodeView.vue";

/** The suggestion chip a DM clicked to generate from. The chip marks where the
 *  Chronicler meant the picture to go, so the image it starts takes the chip's
 *  place rather than landing at the cursor. */
export interface IllustrationTarget {
  pos: number;
  prompt: string;
}

export interface IllustrationSuggestionOptions {
  onPromptClick?: (target: IllustrationTarget) => void;
}

/**
 * Where the clicked suggestion sits now, or null if it is gone. The recorded
 * position is checked first, then the document is searched by prompt, because
 * a pending image elsewhere in the note can resolve while the dialog is open
 * and shift everything after it.
 */
export function findIllustrationSuggestion(
  doc: PmNode,
  target: IllustrationTarget,
): { pos: number; node: PmNode } | null {
  const isTarget = (node: PmNode | null | undefined): node is PmNode =>
    node?.type.name === "illustrationSuggestion" && node.attrs.prompt === target.prompt;
  if (target.pos >= 0 && target.pos < doc.content.size) {
    const at = doc.nodeAt(target.pos);
    if (isTarget(at)) return { pos: target.pos, node: at };
  }
  let found: { pos: number; node: PmNode } | null = null;
  doc.descendants((node, pos) => {
    if (found) return false;
    if (isTarget(node)) {
      found = { pos, node };
      return false;
    }
    return true;
  });
  return found;
}

export const IllustrationSuggestion = Node.create<IllustrationSuggestionOptions>({
  name: "illustrationSuggestion",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addOptions() {
    return { onPromptClick: undefined };
  },

  addAttributes() {
    return {
      prompt: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-prompt") ?? "",
        renderHTML: (attrs) => ({ "data-prompt": attrs.prompt }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-illustration-suggestion]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes({ "data-illustration-suggestion": "" }, HTMLAttributes),
    ];
  },

  addNodeView() {
    return VueNodeViewRenderer(IllustrationSuggestionNodeView);
  },
});
