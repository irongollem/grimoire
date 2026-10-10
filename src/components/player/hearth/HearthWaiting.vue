<template>
  <HearthSection title="Waiting for you">
    <template v-if="waiting.length" #end>
      <span class="flex items-center gap-1.5 text-label text-muted-foreground">
        <EntityNewDot :is-new="true" size="sm" :title="`${waiting.length} waiting`" />
        {{ waiting.length }}
      </span>
    </template>

    <ul v-if="waiting.length" class="flex flex-col gap-2">
      <li v-for="w in waiting" :key="w.key" class="torn bg-card border rounded-lg flex items-center gap-3 p-3">
        <div class="flex min-w-0 flex-1 flex-col">
          <span class="text-eyebrow text-muted-foreground">{{ w.eyebrow }}</span>
          <span class="truncate text-body font-semibold">{{ w.title }}</span>
          <span v-if="w.detail" class="truncate text-caption text-muted-foreground first-letter:uppercase">{{ w.detail }}</span>
        </div>
        <AppButton v-if="w.to" variant="subtle" size="md" :to="w.to" :label="w.action" />
        <!-- Quiet, not gilt: the claim itself happens in chat, where the race is. -->
        <AppButton v-else variant="subtle" size="md" :label="w.action" @click="ui.openChatAt(w.messageId)" />
      </li>
    </ul>
    <p v-else class="px-1 text-body text-muted-foreground">Nothing waiting for you.</p>
  </HearthSection>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { RouteLocationRaw } from "vue-router";
import HearthSection from "./HearthSection.vue";
import AppButton from "@/components/common/AppButton.vue";
import EntityNewDot from "@/components/common/EntityNewDot.vue";
import { useCampaignMessages, loadChatHistory } from "@/composables/campaign/useCampaignMessages";
import { usePlayerUnread } from "@/composables/player/usePlayerUnread";
import { openTableItems, type WaitingItem } from "@/lib/hearth/waitingItems";
import { useUiStore } from "@/stores/ui";

/**
 * What the table has put in front of this player. Handouts open their page.
 * Loot, chests and offers stay in the chat, where the race to claim them
 * happens, so this only points there: "To the drop", "To the offer". Nothing
 * is ever claimed from the Hearth.
 */
const { startedAt } = defineProps<{ startedAt: string | null }>();

const ui = useUiStore();
const { items: unread } = usePlayerUnread();
const { messages, myUserId } = useCampaignMessages();
// This surface reads the message list itself, so it asks for the history the
// closed chat otherwise defers (#999).
loadChatHistory();

interface WaitingRow {
  key: string;
  eyebrow: string;
  title: string;
  detail: string | null;
  action: string;
  messageId: string;
  to: RouteLocationRaw | null;
}

const EYEBROW: Record<WaitingItem["kind"], string> = {
  item: "Loot on the table",
  coins: "Loot on the table",
  chest: "Loot on the table",
  offer: "For sale",
  vendor: "For sale",
};

const waiting = computed<WaitingRow[]>(() => {
  const handouts = unread.value
    .filter((i) => i.kind === "handout")
    .map((h): WaitingRow => ({
      key: `handout-${h.id}`,
      eyebrow: "Handout",
      title: h.title,
      detail: null,
      action: "Open",
      messageId: "",
      to: h.to,
    }));
  const table = startedAt
    ? openTableItems(messages.value, myUserId.value, startedAt).map((t): WaitingRow => {
        const sender = t.kind === "offer" ? (messages.value.find((m) => m.id === t.messageId)?.sender_name ?? null) : null;
        return {
          key: `msg-${t.messageId}`,
          eyebrow: sender ? `For sale · from ${sender}` : EYEBROW[t.kind],
          title: t.title,
          detail: t.detail,
          action: t.kind === "offer" || t.kind === "vendor" ? "To the offer" : "To the drop",
          messageId: t.messageId,
          to: null,
        };
      })
    : [];
  return [...handouts, ...table];
});
</script>
