<template>
  <NodeViewWrapper as="span">
    <CalendarEventRefChip
      :event-id="node.attrs.eventId as string | null"
      :label="node.attrs.label as string"
      :editable="editor.isEditable"
    />
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import { nodeViewProps, NodeViewWrapper } from "@tiptap/vue-3";
import CalendarEventRefChip from "./CalendarEventRefChip.vue";

// The editor-side adapter — see EntityMentionNodeView.
defineProps({ ...nodeViewProps });
</script>
