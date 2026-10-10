<template>
  <span>On {{ name ?? "???" }}</span>
</template>

<script setup lang="ts">
import { useMentionName, type MentionNameType } from "@/composables/notes/useMentionName";

/**
 * "On <name>" for one entity note. Each label resolves its own subject, so only
 * the source a note's type needs is subscribed to; "???" when this player does
 * not know the entity, as the mention chip draws it, never a stored or true name.
 * Type and id are fixed for a row, so they are read once.
 */
const { entityType, entityId } = defineProps<{ entityType: MentionNameType | null; entityId: string }>();

const name = useMentionName(entityType, entityId);
</script>
