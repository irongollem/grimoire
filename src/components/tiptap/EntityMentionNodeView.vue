<template>
  <NodeViewWrapper as="span">
    <EntityMentionChip
      :entity-type="node.attrs.entityType as EntityType"
      :id="node.attrs.id as string"
      :editable="editor.isEditable"
    />
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import { nodeViewProps, NodeViewWrapper } from "@tiptap/vue-3";
import type { EntityType } from "@/lib/tiptap/EntityMention";
import EntityMentionChip from "./EntityMentionChip.vue";

// The editor-side adapter. The chip itself takes plain props so the read-only
// viewer can render it without Tiptap; only this wrapper knows about nodes.
defineProps({ ...nodeViewProps });
</script>
