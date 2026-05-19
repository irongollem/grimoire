<template>
  <div class="space-y-3">
    <div>
      <label class="field-label">Appearance</label>
      <RichTextEditor
        :model-value="appearance"
        placeholder="Physical description, clothing, distinguishing features…"
        min-height="100px"
        :ai-context="`NPC appearance — ${npcName || 'unnamed NPC'}`"
        @update:model-value="emit('update:appearance', $event)"
      />
    </div>
    <div>
      <label class="field-label">Personality</label>
      <RichTextEditor
        :model-value="personality"
        placeholder="Traits, mannerisms, ideals, bonds, flaws…"
        min-height="100px"
        :ai-context="`NPC personality — ${npcName || 'unnamed NPC'}`"
        @update:model-value="emit('update:personality', $event)"
      />
    </div>
    <div>
      <label class="field-label">Backstory</label>
      <RichTextEditor
        :model-value="backstory"
        placeholder="History, origin, formative events…"
        min-height="140px"
        :ai-context="`NPC backstory — ${npcName || 'unnamed NPC'}`"
        @update:model-value="emit('update:backstory', $event)"
      />
    </div>
    <div>
      <label class="field-label">DM Notes</label>
      <RichTextEditor
        :model-value="notes"
        placeholder="Session notes, secrets, loose threads…"
        min-height="100px"
        :ai-context="`NPC notes — ${npcName || 'unnamed NPC'}`"
        @update:model-value="emit('update:notes', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import RichTextEditor from '@/components/common/RichTextEditor.vue'

const {
  npcName = '',
  appearance = null,
  personality = null,
  backstory = null,
  notes = null,
} = defineProps<{
  npcName?: string
  appearance?: string | null
  personality?: string | null
  backstory?: string | null
  notes?: string | null
}>()

const emit = defineEmits<{
  'update:appearance': [value: string | null]
  'update:personality': [value: string | null]
  'update:backstory': [value: string | null]
  'update:notes': [value: string | null]
}>()
</script>

<style scoped>
@reference "@/assets/main.css";
.field-label {
  @apply block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1;
}
</style>
