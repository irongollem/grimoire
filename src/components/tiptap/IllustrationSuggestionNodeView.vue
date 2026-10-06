<template>
  <NodeViewWrapper>
    <IllustrationSuggestionChip
      :prompt="(node.attrs.prompt as string) || ''"
      :editable="editor.isEditable"
      @generate="onGenerate"
    />
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import { nodeViewProps, NodeViewWrapper } from "@tiptap/vue-3";
import type { IllustrationSuggestionOptions } from "@/lib/tiptap/IllustrationSuggestion";
import IllustrationSuggestionChip from "./IllustrationSuggestionChip.vue";

// The editor-side adapter — see EntityMentionNodeView. Only this wrapper knows
// the node's position, which `onPromptClick` needs.
const props = defineProps({ ...nodeViewProps });

function onGenerate() {
  const options = props.extension.options as IllustrationSuggestionOptions;
  const pos = props.getPos();
  if (typeof pos !== "number") return;
  options.onPromptClick?.({ pos, prompt: (props.node.attrs.prompt as string) || "" });
}
</script>
