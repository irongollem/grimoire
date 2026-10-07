<template>
  <NodeViewWrapper>
    <PendingImageCard
      :status="node.attrs.status as string"
      :prompt="(node.attrs.prompt as string) || ''"
      :started-at="node.attrs.startedAt as number | null"
      :editable="editor.isEditable"
      @remove="deleteNode()"
    />
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import { nodeViewProps, NodeViewWrapper } from "@tiptap/vue-3";
import PendingImageCard from "./PendingImageCard.vue";

// The editor-side adapter — see EntityMentionNodeView.
defineProps({ ...nodeViewProps });
</script>
