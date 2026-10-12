<template>
  <div class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-card p-4">
    <div class="min-w-0 flex-1 basis-48">
      <h3 class="truncate text-heading-xs font-bold text-foreground">{{ set.name }}</h3>
      <p class="text-label text-muted-foreground">
        {{ members.length }} NPC{{ members.length === 1 ? "" : "s" }}
        <template v-if="missingCount">
          · <span class="text-destructive/80">{{ missingCount }} removed</span>
        </template>
      </p>
      <p v-if="set.description" class="line-clamp-1 text-caption text-muted-foreground">{{ set.description }}</p>
    </div>

    <NpcSetThumbs v-if="members.length" :members="members" :max="5" />
    <p v-else class="text-caption italic text-muted-foreground">No NPCs in this set yet.</p>

    <div class="flex shrink-0 items-center gap-1">
      <AppButton
        variant="outline"
        size="sm"
        :icon="IconExport"
        label="Export"
        :disabled="!members.length"
        @click="emit('export')"
      />
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
</template>

<script setup lang="ts">
/**
 * An NPC set as one line, the rows counterpart to `NpcSetCard`. Not an
 * `EntityListRow`: a set has no page to open (editing is a modal), so the row
 * is not a link and carries its three controls in plain view.
 */
import { computed } from "vue";
import { IconDelete, IconEdit, IconExport } from "@/lib/icons";
import AppButton from "@/components/common/controls/AppButton.vue";
import NpcSetThumbs from "@/components/npcs/NpcSetThumbs.vue";
import type { NpcListRow, NpcSet } from "@/types/npc.types";

const { set, members } = defineProps<{
  set: NpcSet;
  /** Resolved, in-order set members (parent filters out deleted NPCs). */
  members: NpcListRow[];
}>();
const emit = defineEmits<{ export: []; edit: []; delete: [] }>();

// npc_ids that no longer resolve to a live NPC (deleted since the set was built).
const missingCount = computed(() => set.npc_ids.length - members.length);
</script>
