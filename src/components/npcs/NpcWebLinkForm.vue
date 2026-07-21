<template>
  <div class="p-4 space-y-4">
    <div class="flex items-center justify-between gap-2">
      <h2 class="text-label-lg font-bold text-primary uppercase">New Connection</h2>
      <button type="button" class="text-muted-foreground hover:text-foreground transition-colors" @click="$emit('cancel')">
        <IconClose class="h-4 w-4" />
      </button>
    </div>

    <!-- The two nodes -->
    <div class="flex items-center gap-2">
      <span class="flex-1 min-w-0 px-2 py-1.5 rounded-md bg-muted font-cinzel text-xs font-semibold text-foreground truncate text-center">{{ labelA }}</span>
      <IconLinkAlt class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span class="flex-1 min-w-0 px-2 py-1.5 rounded-md bg-muted font-cinzel text-xs font-semibold text-foreground truncate text-center">{{ labelB }}</span>
    </div>

    <!-- Relationship type -->
    <div>
      <label class="field-label">Relationship</label>
      <select :value="linkType" class="field-input" @change="$emit('update:linkType', ($event.target as HTMLSelectElement).value)">
        <option v-for="[k, label] in typeOptions" :key="k" :value="k">{{ label }}</option>
      </select>
    </div>

    <!-- Notes -->
    <div>
      <label class="field-label">
        Notes
        <span class="font-fell font-normal normal-case text-muted-foreground">(optional)</span>
      </label>
      <input
        :value="linkNotes"
        placeholder="Brief context…"
        class="field-input"
        @input="$emit('update:linkNotes', ($event.target as HTMLInputElement).value)"
      />
    </div>

    <!-- Actions -->
    <div class="flex gap-2 pt-1 flex-wrap">
      <button
        type="button"
        class="flex-1 px-3 py-1.5 font-cinzel text-xs font-semibold text-muted-foreground border border-border rounded-md hover:text-foreground transition-colors"
        @click="$emit('cancel')"
      >Cancel</button>
      <button
        type="button"
        :disabled="isSaving"
        class="flex-1 px-3 py-1.5 font-cinzel text-xs font-semibold bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
        @click="$emit('save')"
      >{{ isSaving ? 'Saving…' : 'Save' }}</button>
      <button
        v-if="canDelete"
        type="button"
        :disabled="isSaving"
        class="w-full px-3 py-1.5 font-cinzel text-xs font-semibold text-destructive border border-destructive/40 rounded-md hover:bg-destructive/10 disabled:opacity-50 transition-colors"
        @click="$emit('delete')"
      >Delete connection</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IconClose, IconLinkAlt } from '@/lib/icons';
import type { NpcRelationshipType } from '@/types/npc.types';

const {
  labelA,
  labelB,
  linkType,
  linkNotes,
  isSaving,
  canDelete,
  typeOptions,
} = defineProps<{
  labelA: string;
  labelB: string;
  linkType: NpcRelationshipType;
  linkNotes: string;
  isSaving: boolean;
  canDelete: boolean;
  typeOptions: [NpcRelationshipType, string][];
}>();

defineEmits<{
  cancel: [];
  save: [];
  delete: [];
  'update:linkType': [value: string];
  'update:linkNotes': [value: string];
}>();
</script>

<style scoped>
@reference "@/assets/main.css";
.field-input {
  @apply w-full bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring;
}
.field-label {
  @apply block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1;
}
</style>
