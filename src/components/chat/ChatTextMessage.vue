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
    <div class="flex items-center justify-between mt-0.5">
      <button
        v-if="targetRoute"
        class="font-cinzel text-[10px] font-semibold tracking-wider text-primary/70 hover:text-primary not-italic transition-colors"
        @click="router.push(targetRoute)"
      >View →</button>
      <span v-else class="grow" />
      <p class="font-fell text-[10px] text-muted-foreground/50">{{ timeLabel }}</p>
    </div>
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
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import type { EntityLinkMetadata } from "@/types/chat.types";

const router = useRouter();
const auth = useAuthStore();

const {
  isSystem = false,
  isOwn = false,
  senderName = null,
  recipientName = null,
  skillLabel = null,
  message,
  renderedMessage = '',
  timeLabel,
  entityLink = null,
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
  /** Optional entity link — when present, shows a "View →" button routing to the entity. */
  entityLink?: EntityLinkMetadata | null;
}>();

const targetRoute = computed((): string | null => {
  if (!entityLink) return null;
  const { entity_type, entity_id } = entityLink;
  if (auth.isDM) {
    switch (entity_type) {
      case "note": return `/notes/${entity_id}`;
      case "quest": return `/quests/${entity_id}`;
      case "npc": return `/npcs/${entity_id}`;
      case "location": return `/locations/${entity_id}`;
      case "calendar_event": return "/calendar";
    }
  } else {
    switch (entity_type) {
      case "note": return "/play/journal";
      case "quest": return `/play/quests/${entity_id}`;
      case "npc": return `/play/party?npc=${entity_id}`;
      case "location": return "/play/atlas";
      case "calendar_event": return "/play/calendar";
      default: return null;
    }
  }
  return null;
});
</script>
