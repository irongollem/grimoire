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
        <button type="button" class="icon-btn" title="Edit set" @click="emit('edit')">
          <IconEdit class="size-4" />
        </button>
        <button type="button" class="icon-btn danger" title="Delete set" @click="emit('delete')">
          <IconDelete class="size-4" />
        </button>
      </div>
    </div>

    <p v-if="set.description" class="set-desc">{{ set.description }}</p>

    <div v-if="members.length" class="set-thumbs">
      <img
        v-for="npc in previewMembers"
        :key="npc.id"
        class="set-thumb"
        :src="portrait(npc)"
        :alt="displayName(npc)"
        :title="displayName(npc)"
        loading="lazy"
        @error="onImgError"
      />
      <span v-if="overflowCount" class="set-thumb-more">+{{ overflowCount }}</span>
    </div>
    <p v-else class="set-empty">No NPCs in this set yet.</p>

    <button
      type="button"
      class="export-btn"
      :disabled="!members.length"
      @click="emit('export')"
    >
      <IconExport class="size-4" />
      Export to Card Forge
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconEdit, IconDelete, IconExport } from "@/lib/icons";
import { getNpcDisplayName, getNpcDisplayPortrait } from "@/lib/npcDisplay";
import type { Npc, NpcSet } from "@/types/npc.types";

const props = defineProps<{
  set: NpcSet;
  /** Resolved, in-order set members (parent filters out deleted NPCs). */
  members: Npc[];
}>();
const emit = defineEmits<{ export: []; edit: []; delete: [] }>();

const PLACEHOLDER = "/assets/placeholders/npc.webp";
const MAX_THUMBS = 6;

// npc_ids that no longer resolve to a live NPC (deleted since the set was built).
const missingCount = computed(() => props.set.npc_ids.length - props.members.length);
const previewMembers = computed(() => props.members.slice(0, MAX_THUMBS));
const overflowCount = computed(() => Math.max(0, props.members.length - MAX_THUMBS));

function displayName(npc: Npc): string {
  return getNpcDisplayName(npc) ?? "???";
}
function portrait(npc: Npc): string {
  return getNpcDisplayPortrait(npc) || PLACEHOLDER;
}
function onImgError(e: Event) {
  (e.target as HTMLImageElement).src = PLACEHOLDER;
}
</script>

<style scoped>
@reference "@/assets/main.css";

.set-card {
  @apply flex flex-col gap-3 rounded-xl border border-border bg-card p-4;
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
.icon-btn {
  @apply flex size-8 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:text-foreground transition-colors;
}
.icon-btn.danger {
  @apply hover:text-destructive;
}
.set-desc {
  @apply text-body text-muted-foreground line-clamp-2;
}
.set-thumbs {
  @apply flex flex-wrap items-center gap-1.5;
}
.set-thumb {
  @apply size-9 rounded-md object-cover bg-muted border border-border;
}
.set-thumb-more {
  @apply flex size-9 items-center justify-center rounded-md border border-border bg-muted font-cinzel text-xs font-semibold text-muted-foreground;
}
.set-empty {
  @apply text-body text-muted-foreground italic;
}
.export-btn {
  @apply mt-auto inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-label-lg font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed;
}
</style>
