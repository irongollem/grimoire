<template>
  <div class="flex items-start gap-2.5" data-testid="npc-speech">
    <!-- The initial sits under the picture, so a picture that will not load leaves the initial showing. -->
    <div class="relative size-10 shrink-0 overflow-hidden rounded-full border border-border bg-muted" data-testid="npc-speech-avatar">
      <span class="absolute inset-0 flex items-center justify-center text-label-lg font-bold text-muted-foreground" aria-hidden="true" data-testid="npc-speech-initial">{{ initial }}</span>
      <FocalImage v-if="drawn" :src="drawn" :focal-point="focal" alt="" format="token" record class="absolute inset-0" />
    </div>
    <div class="relative min-w-0 flex-1">
      <!-- The tail: a turned square that shares the bubble's border, so the bubble points at the face. -->
      <span class="absolute -left-1 top-3.5 size-2 rotate-45 border-b border-l border-border bg-muted" aria-hidden="true" />
      <div class="rounded-lg border border-border bg-muted px-3 py-2">
        <div class="mb-0.5 flex items-center gap-1">
          <span class="text-label font-semibold text-primary" data-testid="npc-speech-name">{{ name }}</span>
          <!-- AI Act Art. 50: a line a model wrote says so, for every reader. -->
          <span v-if="ai" class="rounded border border-border px-1 text-caption-sm text-muted-foreground" title="Written by AI" data-testid="npc-speech-ai">AI</span>
        </div>
        <blockquote class="text-body leading-snug text-foreground">
          <!-- The line: plain text by default; the chat passes its sanitized markdown through this slot. -->
          <slot name="line"><p class="whitespace-pre-line" data-testid="npc-speech-line">{{ line }}</p></slot>
        </blockquote>
        <!-- Actions on the line ("Said it"). A future "Speak aloud" (#1273) goes here too, beside them. -->
        <div v-if="$slots.default" class="mt-1.5"><slot /></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * An NPC's word, in a speech bubble led by the NPC's face (#1270): the Familiar's voice lines draw each line as one, and
 * the chat draws every line an NPC says the same way, so a line looks like itself from the DM's card to the players'
 * screens. The portrait is passed in, never looked up: the chat has only what the message carried. A picture that is
 * missing, unsafe or unable to load leaves the NPC's initial showing.
 */
import { computed } from "vue";
import FocalImage from "@/components/common/media/FocalImage.vue";
import { useLowArt } from "@/composables/useLowArt";
import { safePortraitUrl } from "@/lib/chat/npcSpeech";

const { name, line = "", portrait = null, focal = null, ai = false } = defineProps<{
  name: string;
  /** Plain text. Leave empty and fill the `line` slot to draw it another way. */
  line?: string;
  portrait?: string | null;
  focal?: { x: number; y: number } | null;
  /** A model wrote the line: says so in the corner of the bubble. */
  ai?: boolean;
}>();

const { lowArt } = useLowArt();

/** The picture to draw: a safe URL only, and none with low art on. */
const drawn = computed(() => (lowArt.value ? null : safePortraitUrl(portrait)));
const initial = computed(() => name.trim().charAt(0).toUpperCase() || "?");
</script>
