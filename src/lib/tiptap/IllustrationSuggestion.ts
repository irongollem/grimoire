import { Node, mergeAttributes } from "@tiptap/core";
import { VueNodeViewRenderer } from "@tiptap/vue-3";
import IllustrationSuggestionChip from "@/components/tiptap/IllustrationSuggestionChip.vue";

export interface IllustrationSuggestionOptions {
  onPromptClick?: (prompt: string) => void;
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
    return VueNodeViewRenderer(IllustrationSuggestionChip);
  },
});
