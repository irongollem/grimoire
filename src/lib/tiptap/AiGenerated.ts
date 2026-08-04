import { Node, mergeAttributes } from "@tiptap/core";

/*
 * AiGenerated — machine-readable wrapper for Chronicler-generated note content
 * (#606, context/compliance/provenance-architecture.md §6).
 *
 * The Chronicler ("Write Chronicle") inserts its output wrapped in this node
 * so `data-ai-generated="true"` (+ `data-ai-model` when the model is known)
 * lands on the root element of the AI-authored block, the same way Columns
 * wraps a two-column selection. Because it's a real node in the schema
 * (not an ad-hoc attribute on an unknown div), it survives Tiptap's
 * parse -> JSON -> serialize round trip on every subsequent edit/save —
 * unknown attributes on unknown wrappers get silently dropped otherwise.
 *
 * This is the machine-readable layer only, per the architecture doc's split:
 * the player-facing disclosure (`AiGeneratedBadge`) reads `note.ai_provenance`
 * on the note row, not this node — this node carries no UI chrome and content
 * inside it renders exactly like any other block.
 */
export const AiGenerated = Node.create({
  name: "aiGenerated",
  group: "block",
  content: "block+",

  addAttributes() {
    return {
      model: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute("data-ai-model"),
        renderHTML: (attrs: { model?: string | null }) =>
          attrs.model ? { "data-ai-model": attrs.model } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-ai-generated="true"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes({ "data-ai-generated": "true" }, HTMLAttributes), 0];
  },
});
