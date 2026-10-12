<template>
  <div class="set-card">
    <div class="set-head">
      <div class="set-titles">
        <h3 class="set-name">{{ set.name }}</h3>
        <p class="set-meta">
          {{ members.length }} NPC{{ members.length === 1 ? "" : "s" }}
          <template v-if="missingCount">
            · <span class="set-missing">{{ missingCount }} removed</span>
          </template>
        </p>
      </div>
      <div class="set-tools">
        <AppButton variant="subtle" size="icon-sm" :icon="IconEdit" tooltip="Edit set" @click="emit('edit')" />
        <AppButton
          variant="subtle"
          tone="danger"
          size="icon-sm"
          :icon="IconDelete"
          tooltip="Delete set"
          @click="emit('delete')"
        />
      </div>
    </div>

    <p v-if="set.description" class="set-desc">{{ set.description }}</p>

    <NpcSetThumbs v-if="members.length" :members="members" />
    <p v-else class="set-empty">No NPCs in this set yet.</p>

    <AppButton
      variant="primary"
      block
      class="mt-auto"
      :icon="IconExport"
      label="Export to Card Forge"
      :disabled="!members.length"
      @click="emit('export')"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconEdit, IconDelete, IconExport } from "@/lib/icons";
import AppButton from "@/components/common/controls/AppButton.vue";
import NpcSetThumbs from "@/components/npcs/NpcSetThumbs.vue";
import type { NpcListRow, NpcSet } from "@/types/npc.types";

const props = defineProps<{
  set: NpcSet;
  /** Resolved, in-order set members (parent filters out deleted NPCs). */
  members: NpcListRow[];
}>();
const emit = defineEmits<{ export: []; edit: []; delete: [] }>();

// npc_ids that no longer resolve to a live NPC (deleted since the set was built).
const missingCount = computed(() => props.set.npc_ids.length - props.members.length);
</script>

<style scoped>
@reference "@/assets/main.css";

.set-card {
  @apply flex h-full flex-col gap-3 rounded-xl border border-border bg-card p-4;
}
.set-head {
  @apply flex items-start justify-between gap-2;
}
.set-titles {
  @apply min-w-0;
}
.set-name {
  @apply text-heading-sm font-bold text-foreground truncate;
}
.set-meta {
  @apply text-caption text-muted-foreground;
}
.set-missing {
  @apply text-destructive/80;
}
.set-tools {
  @apply flex shrink-0 items-center gap-1;
}
.set-desc {
  @apply text-body text-muted-foreground line-clamp-2;
}
.set-empty {
  @apply text-body text-muted-foreground italic;
}
</style>
