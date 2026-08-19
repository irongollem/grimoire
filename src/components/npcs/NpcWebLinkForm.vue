<template>
  <div class="p-4 space-y-4">
    <div class="flex items-center justify-between gap-2">
      <h2 class="text-label-lg font-bold text-primary uppercase">New Connection</h2>
      <AppButton variant="ghost" size="inline-xs" icon-size="md" :icon="IconClose" aria-label="Close" @click="emit('cancel')" />
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
      <AppSelect v-model="linkTypeModel" tone="filled" size="body" weight="normal" block>
        <option v-for="[k, label] in typeOptions" :key="k" :value="k">{{ label }}</option>
      </AppSelect>
    </div>

    <!-- Notes -->
    <div>
      <label class="field-label">
        Notes
        <span class="font-fell font-normal normal-case text-muted-foreground">(optional)</span>
      </label>
      <AppInput v-model="linkNotesModel" tone="filled" size="body" placeholder="Brief context…" />
    </div>

    <!-- Actions -->
    <div class="flex gap-2 pt-1 flex-wrap">
      <AppButton variant="subtle" size="sm" class="flex-1" label="Cancel" @click="emit('cancel')" />
      <AppButton
        variant="primary"
        size="sm"
        class="flex-1"
        :disabled="isSaving"
        :label="isSaving ? 'Saving…' : 'Save'"
        @click="emit('save')"
      />
      <AppButton
        v-if="canDelete"
        variant="destructive"
        size="sm"
        block
        :disabled="isSaving"
        label="Delete connection"
        @click="emit('delete')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { IconClose, IconLinkAlt } from '@/lib/icons';
import AppButton from '@/components/common/AppButton.vue';
import AppInput from '@/components/common/AppInput.vue';
import AppSelect from '@/components/common/AppSelect.vue';
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

const emit = defineEmits<{
  cancel: [];
  save: [];
  delete: [];
  'update:linkType': [value: string];
  'update:linkNotes': [value: string];
}>();

// AppSelect/AppInput need a two-way v-model; this component's type/notes are
// controlled entirely by the parent via props + emit, so a writable computed
// bridges the two without introducing local state.
const linkTypeModel = computed<NpcRelationshipType>({
  get: () => linkType,
  set: (value) => emit('update:linkType', value),
});

const linkNotesModel = computed<string>({
  get: () => linkNotes,
  set: (value) => emit('update:linkNotes', value),
});
</script>

<style scoped>
@reference "@/assets/main.css";
.field-label {
  @apply block text-label-lg font-semibold text-muted-foreground mb-1;
}
</style>
