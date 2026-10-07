<template>
  <div class="illus-wrapper" contenteditable="false">
    <button
      type="button"
      class="illus-chip"
      :class="canGenerate ? 'illus-chip--editor' : 'illus-chip--viewer'"
      :title="canGenerate ? `Click to generate illustration: ${prompt}` : prompt"
      @click="handleClick"
    >
      <IconImage class="illus-icon" />
      <span class="illus-label font-fell">
        <span class="illus-prefix font-cinzel">Illustration suggestion</span>
        <span class="illus-prompt">{{ truncated }}</span>
      </span>
      <IconGenerate v-if="canGenerate" class="illus-action-icon" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconGenerate, IconImage } from '@/lib/icons';
import { useCampaignStore } from "@/stores/campaign";

// Plain props, not Tiptap's `nodeViewProps` — see EntityMentionChip. The
// editor wrapper turns `generate` into the extension's `onPromptClick` (it
// alone knows the node's position).
const props = defineProps<{
  prompt: string;
  editable: boolean;
}>();
const emit = defineEmits<{ generate: [] }>();

const campaignStore = useCampaignStore();
const isEditable = computed(() => props.editable);
// The chip only offers to generate when AI is on; with AI off it reads as a
// plain note, like it does for a viewer.
const canGenerate = computed(() => isEditable.value && campaignStore.isAiEnabled);
const prompt     = computed(() => props.prompt);
const truncated  = computed(() => {
  const p = prompt.value;
  return p.length > 80 ? p.slice(0, 77) + "…" : p;
});

function handleClick() {
  if (!canGenerate.value) return;
  emit("generate");
}
</script>

<style scoped>
@reference "@/assets/main.css";

.illus-wrapper {
  display: block;
  margin: 0.75rem 0;
}

.illus-chip {
  display: inline-flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.4rem 0.75rem;
  border-radius: 0.375rem;
  border: 1px dashed;
  width: 100%;
  text-align: left;
  transition: background-color 0.15s, border-color 0.15s;
}

.illus-chip--editor {
  border-color: theme(colors.tone-caution / 50%);
  background: theme(colors.tone-caution / 6%);
  color: theme(colors.ink-caution);
  cursor: pointer;
}
.illus-chip--editor:hover {
  background: theme(colors.tone-caution / 14%);
  border-color: theme(colors.tone-caution / 70%);
}

.illus-chip--viewer {
  border-color: theme(colors.border);
  background: theme(colors.muted / 30%);
  color: theme(colors.muted-foreground);
  cursor: default;
}

.illus-icon {
  width: 0.9rem;
  height: 0.9rem;
  flex-shrink: 0;
  margin-top: 0.05rem;
}

.illus-label {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.illus-prefix {
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  opacity: 0.7;
  text-transform: uppercase;
}

.illus-prompt {
  font-size: 0.75rem;
  line-height: 1.4;
  white-space: normal;
  word-break: break-word;
}

.illus-action-icon {
  width: 0.75rem;
  height: 0.75rem;
  flex-shrink: 0;
  margin-top: 0.15rem;
  opacity: 0.6;
}
</style>
