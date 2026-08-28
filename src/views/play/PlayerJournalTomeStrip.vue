<template>
  <!-- Tome tabs — one per document item currently in the party's
       inventory. TabBar's fixed label/count/badge markup has no slot for
       the EntityNewDot each tome needs, and TabBar itself is outside this
       story's editable files, so these render as a second row of pill
       AppButtons (the same recipe PlayerJournalMyTab's category filter
       uses) rather than forking TabBar's underline markup by hand. -->
  <div class="flex flex-wrap items-center gap-1.5">
    <AppButton
      v-for="tome in tomeTabs"
      :key="tome.id"
      variant="subtle"
      shape="pill"
      size="xs"
      :active="activeTab === tome.id"
      :icon="IconFeather"
      icon-size="xs"
      @click="emit('update:activeTab', tome.id)"
    >
      <span class="inline-flex items-center gap-1.5">
        {{ tome.label }}
        <EntityNewDot :is-new="isTomeUnread(tome.id, tome.item.content_updated_at ?? undefined)" size="sm" />
      </span>
    </AppButton>
  </div>
</template>

<script setup lang="ts">
import { IconFeather } from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";
import EntityNewDot from "@/components/common/EntityNewDot.vue";
import { useReadItems } from "@/composables/play/useReadItems";
import type { Item } from "@/types/item.types";

defineProps<{
  tomeTabs: { id: string; label: string; item: Item }[];
  activeTab: string;
}>();

const emit = defineEmits<{
  (e: "update:activeTab", id: string): void;
}>();

// Unread state for the tome tab strip. The exact rule would be the later of
// content_updated_at and the newest entry's created_at, but that needs a
// live useItemEntries query per tome held in THIS component — a dynamic,
// unbounded number of query hooks driven by a v-for, which fights Vue's
// one-composable-call-per-component-instance model for an unbounded list.
// Falling back to content_updated_at only for the dot in the tab strip;
// PlayerJournalTomeTab still re-marks read off the live entries query once a
// tome is actually the active tab (see that file).
const { isNew: isTomeUnread } = useReadItems("item_document");
</script>
