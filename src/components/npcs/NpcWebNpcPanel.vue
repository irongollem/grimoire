<template>
  <!-- Portrait -->
  <div v-if="npc.portrait_url" class="w-full h-36 shrink-0 bg-muted overflow-hidden">
    <FocalImage
      :src="npc.portrait_url"
      :focal-point="npc.portrait_focal_point ?? undefined"
      :alt="npc.name"
      format="square"
      class="w-full h-full"
    />
  </div>

  <div class="p-4 space-y-3">
    <div class="flex items-start justify-between gap-2">
      <h2 class="font-cinzel text-sm font-bold text-foreground leading-tight">{{ npc.name }}</h2>
      <button type="button" class="text-muted-foreground hover:text-foreground transition-colors shrink-0" @click="$emit('close')">
        <IconClose class="h-4 w-4" />
      </button>
    </div>
    <div v-if="npc.occupation" class="text-caption text-muted-foreground">{{ npc.occupation }}</div>
    <div v-if="npc.race" class="text-caption text-foreground">{{ npc.race }}</div>
    <div class="flex gap-1.5 flex-wrap">
      <span
        class="px-1.5 py-0.5 rounded text-label font-bold"
        :style="{ backgroundColor: relColor(npc.relationship) + '22', color: relColor(npc.relationship) }"
      >{{ npc.relationship }}</span>
      <span class="px-1.5 py-0.5 rounded text-label font-bold bg-muted text-muted-foreground">{{ npc.status }}</span>
    </div>

    <!-- Shift-click hint -->
    <div class="flex items-start gap-1.5 px-2.5 py-2 rounded-md bg-muted/60 text-muted-foreground">
      <IconInfo class="h-3 w-3 shrink-0 mt-0.5" />
      <p class="text-caption leading-snug">Shift+click another node to define a relationship directly from this panel.</p>
    </div>

    <RouterLink
      :to="`/npcs/${npc.id}`"
      class="block text-center px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-cinzel text-xs font-semibold hover:opacity-90 transition-opacity"
    >
      Open Sheet
    </RouterLink>
  </div>

  <!-- Connected to this NPC -->
  <div v-if="connections.length" class="px-4 pb-4">
    <div class="text-label font-bold text-muted-foreground mb-2">CONNECTIONS</div>
    <div class="space-y-1.5">
      <template v-for="conn in connections" :key="conn.id">
        <!-- Inline edit form -->
        <div v-if="editingRelId === conn.id" class="rounded-lg border border-border bg-muted/30 p-2.5 space-y-2">
          <select :value="editRelType" class="field-input text-xs" @change="$emit('update:editRelType', ($event.target as HTMLSelectElement).value)">
            <option v-for="[k, label] in typeOptions" :key="k" :value="k">{{ label }}</option>
          </select>
          <input :value="editRelNotes" placeholder="Notes…" class="field-input text-xs" @input="$emit('update:editRelNotes', ($event.target as HTMLInputElement).value)" />
          <div class="flex items-center gap-1.5">
            <button
              type="button"
              class="flex-1 px-2 py-1 font-cinzel text-2xs font-semibold bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-50 transition-opacity"
              @click="$emit('saveEditRel', conn)"
            >Save</button>
            <button
              type="button"
              class="px-2 py-1 font-cinzel text-2xs font-semibold border border-border rounded text-muted-foreground hover:text-foreground transition-colors"
              @click="$emit('cancelEditRel')"
            >Cancel</button>
            <button
              type="button"
              class="px-2 py-1 font-cinzel text-2xs font-semibold text-destructive hover:opacity-80 transition-opacity"
              @click="$emit('deleteRel', conn.id)"
            >Delete</button>
          </div>
        </div>

        <!-- Normal row — click to edit -->
        <button
          v-else
          type="button"
          class="w-full flex items-center gap-2 text-xs rounded-lg px-1.5 py-1 hover:bg-muted/50 transition-colors group"
          @click="$emit('startEditRel', conn)"
        >
          <span
            class="shrink-0 px-1.5 py-0.5 rounded font-cinzel text-2xs font-bold"
            :style="{ backgroundColor: conn.color + '22', color: conn.color }"
          >{{ conn.typeLabel }}</span>
          <span class="font-fell text-foreground truncate flex-1 text-left">{{ conn.name }}</span>
          <IconEdit class="h-3 w-3 shrink-0 text-muted-foreground [@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { IconClose, IconEdit, IconInfo } from '@/lib/icons';
import FocalImage from '@/components/common/FocalImage.vue';
import {
  NPC_RELATIONSHIP_COLORS,
  type NpcRelationship,
  type NpcRelationshipType,
} from '@/types/npc.types';

interface NpcPanelData {
  id: string;
  name: string;
  occupation?: string | null;
  race?: string | null;
  relationship: string;
  status: string;
  portrait_url?: string | null;
  portrait_focal_point?: { x: number; y: number } | null;
}

interface Connection {
  id: string;
  name: string;
  typeLabel: string;
  effectiveType: NpcRelationshipType;
  isSource: boolean;
  color: string;
  notes: string;
}

const {
  npc,
  connections,
  editingRelId,
  editRelType,
  editRelNotes,
  typeOptions,
} = defineProps<{
  npc: NpcPanelData;
  connections: Connection[];
  editingRelId: string | null;
  editRelType: NpcRelationshipType;
  editRelNotes: string;
  typeOptions: [NpcRelationshipType, string][];
}>();

defineEmits<{
  close: [];
  startEditRel: [conn: Connection];
  saveEditRel: [conn: Connection];
  cancelEditRel: [];
  deleteRel: [id: string];
  'update:editRelType': [value: string];
  'update:editRelNotes': [value: string];
}>();

function relColor(rel: string): string {
  return NPC_RELATIONSHIP_COLORS[rel as NpcRelationship] ?? '#6b7280';
}
</script>

<style scoped>
@reference "@/assets/main.css";
.field-input {
  @apply w-full bg-muted border border-border rounded-md px-3 py-1.5 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring;
}
</style>
