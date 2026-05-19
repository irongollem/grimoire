<template>
  <!-- System / flavor message -->
  <div
    v-if="isSystem"
    class="max-w-[80%] rounded-lg px-3 py-2 bg-muted/40 border border-border/50 italic"
  >
    <p
      v-if="senderName"
      class="font-cinzel text-[10px] font-semibold text-primary not-italic tracking-wider mb-0.5"
    >{{ senderName }}</p>
    <p class="font-fell text-sm text-foreground/80 leading-snug">
      <span
        v-if="skillLabel"
        class="font-cinzel text-[10px] font-semibold text-primary/70 not-italic tracking-wider"
      >{{ skillLabel }}:</span>
      {{ message }}
    </p>
    <p class="font-fell text-[10px] text-muted-foreground/50 mt-0.5 text-right">
      {{ timeLabel }}
    </p>
  </div>

  <!-- Plain chat message -->
  <div
    v-else
    class="max-w-[80%] rounded-lg px-3 py-2"
    :class="
      isOwn
        ? 'bg-primary/15 border border-primary/20'
        : 'bg-muted/60 border border-border'
    "
  >
    <div
      v-if="senderName || recipientName"
      class="flex items-center gap-1 mb-0.5"
    >
      <p class="font-cinzel text-[10px] font-semibold tracking-wider text-primary">
        {{ senderName }}
      </p>
      <span
        v-if="recipientName"
        class="font-fell text-[10px] text-amber-400 italic"
      >
        → {{ recipientName }}
      </span>
    </div>
    <!-- eslint-disable-next-line vue/no-v-html -->
    <p class="font-fell text-sm text-foreground leading-snug whitespace-pre-line" v-html="renderedMessage" />
    <p class="font-fell text-[10px] text-muted-foreground/50 mt-0.5 text-right">
      {{ timeLabel }}
    </p>
  </div>
</template>

<script setup lang="ts">
const {
  isSystem = false,
  isOwn = false,
  senderName = null,
  recipientName = null,
  skillLabel = null,
  message,
  renderedMessage = '',
  timeLabel,
} = defineProps<{
  isSystem?: boolean;
  isOwn?: boolean;
  senderName?: string | null;
  recipientName?: string | null;
  /** For system messages: the skill_label from metadata. */
  skillLabel?: string | null;
  message: string;
  /** Pre-rendered HTML (marked.parseInline output) for chat messages. */
  renderedMessage?: string;
  timeLabel: string;
}>();
</script>
