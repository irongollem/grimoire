<template>
  <div class="space-y-3">
    <div>
      <label class="field-label">Appearance</label>
      <RichTextEditor
        :model-value="appearance"
        placeholder="Physical description, clothing, distinguishing features…"
        size="md"
        allow-lens-pairs
        :ai-context="`NPC appearance: ${npcName || 'unnamed NPC'}`"
        :entity-mention-items="entityMentionItems"
        @update:model-value="emit('update:appearance', $event)"
      />
    </div>
    <div>
      <label class="field-label">Personality</label>
      <RichTextEditor
        :model-value="personality"
        placeholder="Traits, mannerisms, ideals, bonds, flaws…"
        size="md"
        allow-lens-pairs
        :ai-context="`NPC personality: ${npcName || 'unnamed NPC'}`"
        :entity-mention-items="entityMentionItems"
        @update:model-value="emit('update:personality', $event)"
      />
    </div>
    <div>
      <label class="field-label" for="npc-voice">Voice</label>
      <!--
        Native <textarea> on purpose: the model that speaks as this NPC reads this
        as plain text, so a rich editor would hand it markup. Set in the DM's hand
        like every other field they type (data-field), through the field recipe.
        400 is where the profile builder cuts the text.
      -->
      <textarea
        id="npc-voice"
        data-field="input"
        data-field-size="body"
        data-field-tone="muted"
        :value="voice ?? ''"
        :maxlength="VOICE_MAX_LENGTH"
        rows="3"
        placeholder="How they talk: pace, turns of phrase, and a line they might say…"
        :class="cn(fieldVariants({ tone: 'muted', size: 'body' }), 'w-full resize-y')"
        @input="emit('update:voice', ($event.target as HTMLTextAreaElement).value)"
      />
    </div>
    <div>
      <label class="field-label">Backstory</label>
      <RichTextEditor
        :model-value="backstory"
        placeholder="History, origin, formative events…"
        size="md"
        allow-lens-pairs
        :ai-context="`NPC backstory: ${npcName || 'unnamed NPC'}`"
        :entity-mention-items="entityMentionItems"
        @update:model-value="emit('update:backstory', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import RichTextEditor from '@/components/common/richtext/RichTextEditor.vue'
import { fieldVariants } from '@/components/common/controls/fieldVariants'
import { cn } from '@/lib/utils'
import { useEntityMentionItems } from '@/composables/notes/useEntityMentionItems'

// NPC lore is a DM-only surface (this tab is never mounted from /play), so the
// full mention list is always the DM's — see NoteEditor.vue for the same call.
const { mentionItems: entityMentionItems } = useEntityMentionItems()

/** Where `buildNpcProfile` cuts the voice before the model reads it. */
const VOICE_MAX_LENGTH = 400

const {
  npcName = '',
  appearance = null,
  personality = null,
  voice = null,
  backstory = null,
} = defineProps<{
  npcName?: string
  appearance?: string | null
  personality?: string | null
  voice?: string | null
  backstory?: string | null
}>()

const emit = defineEmits<{
  'update:appearance': [value: string | null]
  'update:personality': [value: string | null]
  'update:voice': [value: string]
  'update:backstory': [value: string | null]
}>()
</script>

<style scoped>
@reference "@/assets/main.css";
.field-label {
  @apply block text-label-lg font-semibold text-muted-foreground mb-1;
}
</style>
