<template>
  <div class="flex flex-col h-full min-h-0">
    <!-- Messages -->
    <div ref="scrollEl" class="flex-1 overflow-y-auto px-3 py-3 space-y-2 min-h-0">
      <div v-if="isLoading" class="flex justify-center py-8">
        <LoadingSpinner />
      </div>

      <div
        v-for="msg in messages ?? []"
        :key="msg.id"
        class="rounded-md px-3 py-2"
        :class="msg.type === 'roll' ? 'bg-muted/30 border border-border' : 'bg-muted/10'"
      >
        <!-- Roll message -->
        <template v-if="msg.type === 'roll' && msg.metadata">
          <div class="flex items-baseline gap-2">
            <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider">
              {{ msg.sender_name ?? 'Unknown' }}
            </span>
            <span class="font-fell text-xs text-muted-foreground italic flex-1">
              {{ (msg.metadata as RollMetadata).label }}
            </span>
            <span class="font-cinzel text-xs text-muted-foreground">
              {{ formatTime(msg.created_at) }}
            </span>
          </div>
          <div class="flex items-baseline gap-2 mt-0.5">
            <span
              class="font-cinzel text-2xl font-bold"
              :class="rollResultColor(msg.metadata as RollMetadata)"
            >
              {{ (msg.metadata as RollMetadata).total }}
            </span>
            <span class="font-fell text-sm text-muted-foreground">
              <template v-if="getDice(msg.metadata as RollMetadata) !== null">
                d20 ({{ getDice(msg.metadata as RollMetadata) }})
              </template>
              <template v-if="(msg.metadata as RollMetadata).modifier !== 0">
                {{ (msg.metadata as RollMetadata).modifier >= 0 ? '+' : '' }}{{ (msg.metadata as RollMetadata).modifier }}
              </template>
            </span>
            <span
              v-if="(msg.metadata as RollMetadata).isCrit"
              class="font-cinzel text-[10px] text-gold-500 tracking-wider"
            >NAT 20!</span>
            <span
              v-else-if="(msg.metadata as RollMetadata).isFumble"
              class="font-cinzel text-[10px] text-destructive tracking-wider"
            >NAT 1</span>
          </div>
        </template>

        <!-- Chat message -->
        <template v-else>
          <div class="flex items-baseline gap-2">
            <span class="font-cinzel text-[10px] text-primary tracking-wider">
              {{ msg.sender_name ?? 'Unknown' }}
            </span>
            <span class="font-cinzel text-[10px] text-muted-foreground">
              {{ formatTime(msg.created_at) }}
            </span>
          </div>
          <p class="font-fell text-sm text-foreground mt-0.5">{{ msg.message }}</p>
        </template>
      </div>

      <div v-if="!isLoading && !messages?.length" class="text-center py-8">
        <p class="font-fell text-sm text-muted-foreground italic">No messages yet. Roll a skill to get started!</p>
      </div>
    </div>

    <!-- Input -->
    <div class="border-t border-border px-3 py-3 shrink-0">
      <div class="flex gap-2">
        <input
          v-model="chatInput"
          type="text"
          placeholder="Say something…"
          class="flex-1 bg-muted/30 border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          @keydown.enter="sendChat"
        />
        <button
          class="px-3 py-1.5 bg-primary text-primary-foreground rounded-md font-cinzel text-xs tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
          :disabled="!chatInput.trim()"
          @click="sendChat"
        >
          Send
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from "vue";
import { useCampaignChat } from "@/composables/useCampaignChat";
import { useParty } from "@/composables/useParty";
import { useAuthStore } from "@/stores/auth";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import type { RollMetadata } from "@/types/chat.types";

const { messages, isLoading, postChat } = useCampaignChat();
const { data: partyMembers } = useParty();
const auth = useAuthStore();

const chatInput = ref("");
const scrollEl = ref<HTMLElement | null>(null);

// Scroll to bottom when new messages arrive
watch(
  messages,
  () => {
    nextTick(() => {
      if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight;
    });
  },
  { deep: true },
);

function senderName(): string {
  if (auth.linkedPartyMemberId && partyMembers.value) {
    const m = partyMembers.value.find((p) => p.id === auth.linkedPartyMemberId);
    if (m) return m.name;
  }
  return auth.membership?.display_name ?? auth.userEmail?.split("@")[0] ?? "DM";
}

async function sendChat() {
  const text = chatInput.value.trim();
  if (!text) return;
  chatInput.value = "";
  await postChat(text, senderName());
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Extract the raw d20 value from metadata, if present. */
function getDice(metadata: RollMetadata): number | null {
  const m = metadata as RollMetadata & { dice?: number };
  if (typeof m.dice === "number") return m.dice;
  if (Array.isArray(m.breakdown) && m.breakdown.length > 0) return m.breakdown[0].val;
  return null;
}

function rollResultColor(metadata: RollMetadata): string {
  if (metadata.isCrit) return "text-gold-500";
  if (metadata.isFumble) return "text-destructive";
  if (metadata.total >= 20) return "text-elven-green";
  if (metadata.total >= 15) return "text-foreground";
  return "text-muted-foreground";
}
</script>
