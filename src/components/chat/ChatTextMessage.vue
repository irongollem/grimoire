<template>
  <!-- System / flavor message -->
  <div
    v-if="isSystem"
    class="max-w-[80%] rounded-lg px-3 py-2 bg-muted/40 border border-border/50 italic"
  >
    <p
      v-if="senderName"
      class="text-label font-semibold text-primary not-italic mb-0.5"
    >{{ senderName }}</p>
    <p class="text-body text-foreground/80 leading-snug">
      <span
        v-if="skillLabel"
        class="text-label font-semibold text-primary/70 not-italic"
      >{{ skillLabel }}:</span>
      {{ message }}
    </p>
    <div class="flex items-center justify-between mt-0.5">
      <button
        v-if="targetRoute"
        class="text-label font-semibold text-primary/70 hover:text-primary not-italic transition-colors"
        @click="router.push(targetRoute)"
      >View →</button>
      <span v-else class="grow" />
      <p class="text-caption-sm text-muted-foreground/50">{{ timeLabel }}</p>
    </div>
  </div>

  <!-- An NPC's line (#1270): the NPC's speech bubble, led by the face the message carried. -->
  <div v-else-if="npcSpeech" class="max-w-[85%]" :data-addressed="addressed ? '' : undefined" data-testid="chat-npc-speech">
    <NpcSpeechBubble :name="senderName ?? '???'" :portrait="npcSpeech.portrait" :focal="npcSpeech.focal" :ai="npcSpeech.ai">
      <template #line>
        <!-- eslint-disable-next-line vue/no-v-html -->
        <p class="whitespace-pre-line" v-html="renderedMessage" />
      </template>
      <p class="text-caption-sm text-muted-foreground/50 text-right">{{ timeLabel }}</p>
    </NpcSpeechBubble>
  </div>

  <!-- Plain chat message -->
  <div
    v-else
    class="max-w-[80%] rounded-lg px-3 py-2"
    :class="[
      isOwn
        ? 'bg-primary/15 border border-primary/20'
        : 'bg-muted/60 border border-border',
      addressed ? 'ring-2 ring-primary/50' : '',
    ]"
    :data-addressed="addressed ? '' : undefined"
  >
    <div
      v-if="senderName || recipientName"
      class="flex items-center gap-1 mb-0.5"
    >
      <p class="text-label font-semibold text-primary">
        {{ senderName }}
      </p>
      <!-- AI Act Art. 50: a line a model wrote says so, for every reader. -->
      <span v-if="ai" class="rounded border border-border px-1 text-caption-sm text-muted-foreground" title="Written by AI, playing this character while its player is away" data-testid="chat-ai-mark">AI</span>
      <span
        v-if="recipientName"
        class="text-caption-sm text-ink-caution italic"
      >
        → {{ recipientName }}
      </span>
    </div>
    <!-- eslint-disable-next-line vue/no-v-html -->
    <p class="text-body text-foreground leading-snug whitespace-pre-line" v-html="renderedMessage" />
    <p class="text-caption-sm text-muted-foreground/50 mt-0.5 text-right">
      {{ timeLabel }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { placeRoute } from "@/lib/locations/placeRoute";
import type { EntityLinkMetadata } from "@/types/chat.types";
import type { NpcSpeech } from "@/lib/chat/npcSpeech";
import NpcSpeechBubble from "@/components/npcs/NpcSpeechBubble.vue";

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
  addressed = false,
  ai = false,
  npcSpeech = null,
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
  /** The line names the reader with an "@" (their character, the party, or the DM when they are it). */
  addressed?: boolean;
  /** The line was written by AI playing a character for its absent player (#1021 row 26). */
  ai?: boolean;
  /** The line is an NPC's (its metadata named the NPC): drawn as that NPC's speech bubble. */
  npcSpeech?: NpcSpeech | null;
}>();

const targetRoute = computed((): string | null => {
  if (!entityLink) return null;
  const { entity_type, entity_id } = entityLink;
  if (auth.isDM) {
    switch (entity_type) {
      case "note": return `/notes/${entity_id}`;
      case "quest": return `/quests/${entity_id}`;
      case "npc": return `/npcs/${entity_id}`;
      case "location": return placeRoute(entity_id);
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
