<template>
  <div class="flex flex-col h-full min-h-0">
    <!-- Messages -->
    <div
      ref="scrollEl"
      class="flex-1 overflow-y-auto px-3 py-3 space-y-2 min-h-0"
    >
      <div v-if="loading" class="flex justify-center py-8">
        <LoadingSpinner />
      </div>

      <div
        v-for="msg in messages ?? []"
        :key="msg.id"
        class="rounded-md px-3 py-2"
        :class="
          msg.type === 'roll'
            ? 'bg-muted/30 border border-border'
            : 'bg-muted/10'
        "
      >
        <!-- Roll message -->
        <template v-if="msg.type === 'roll' && msg.metadata">
          <div class="flex items-baseline gap-2">
            <span
              class="text-label text-muted-foreground"
            >
              {{ msg.sender_name ?? "Unknown" }}
            </span>
            <span class="text-caption text-muted-foreground italic flex-1">
              {{ (msg.metadata as RollMetadata).label }}
            </span>
            <span class="font-cinzel text-xs text-muted-foreground">
              {{ formatTime(msg.created_at) }}
            </span>
          </div>
          <div class="flex items-baseline gap-2 mt-0.5">
            <span
              class="text-title font-bold"
              :class="rollResultColor(msg.metadata as RollMetadata)"
            >
              {{ (msg.metadata as RollMetadata).total }}
            </span>
            <!-- Damage roll: show individual die values -->
            <template v-if="(msg.metadata as RollMetadata).isDamage">
              <span class="text-body text-muted-foreground">
                [{{ (msg.metadata as RollMetadata).breakdown.filter(d => !d.dropped).map(d => d.val).join("+") }}]
              </span>
            </template>
            <!-- d20 check: show d20 value + modifier + crit/fumble -->
            <template v-else>
              <span class="text-body text-muted-foreground">
                <template v-if="getDice(msg.metadata as RollMetadata) !== null">
                  d20 ({{ getDice(msg.metadata as RollMetadata) }})
                </template>
                <template v-if="(msg.metadata as RollMetadata).modifier !== 0">
                  {{ (msg.metadata as RollMetadata).modifier >= 0 ? "+" : ""
                  }}{{ (msg.metadata as RollMetadata).modifier }}
                </template>
              </span>
              <span
                v-if="(msg.metadata as RollMetadata).isCrit"
                class="text-eyebrow text-gold-500"
                >NAT 20!</span
              >
              <span
                v-else-if="(msg.metadata as RollMetadata).isFumble"
                class="text-eyebrow text-destructive"
                >NAT 1</span
              >
            </template>
            <span
              v-if="(msg.metadata as RollMetadata).manual"
              class="text-eyebrow text-muted-foreground"
              title="Entered from physical dice"
              >MANUAL</span
            >
          </div>
        </template>

        <!-- Chat message -->
        <template v-else>
          <div class="flex items-baseline gap-2">
            <span class="text-label text-primary">
              {{ msg.sender_name ?? "Unknown" }}
            </span>
            <span class="font-cinzel text-2xs text-muted-foreground">
              {{ formatTime(msg.created_at) }}
            </span>
          </div>
          <p class="text-body text-foreground mt-0.5">
            {{ msg.message }}
          </p>
        </template>
      </div>

      <div v-if="!loading && !messages?.length" class="text-center py-8">
        <p class="text-body text-muted-foreground italic">
          No messages yet. Roll a skill to get started!
        </p>
      </div>
    </div>

    <!-- Input -->
    <div class="border-t border-border px-3 py-3 shrink-0 space-y-2">
      <div v-if="otherMembers.length" class="flex items-center gap-2">
        <span
          class="text-label text-muted-foreground shrink-0"
          >To:</span
        >
        <select
          v-model="whisperTarget"
          class="flex-1 bg-muted/40 border border-border rounded px-2 py-0.5 text-caption text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">Everyone</option>
          <option v-for="m in otherMembers" :key="m.id" :value="m.user_id">
            🤫 {{ bestName(m) }} (whisper)
          </option>
        </select>
      </div>
      <div class="flex gap-2">
        <input
          v-model="chatInput"
          type="text"
          :placeholder="whisperTarget ? `Whisper…` : 'Say something…'"
          :class="whisperTarget ? 'border-amber-500/40 bg-amber-500/5' : ''"
          class="flex-1 bg-muted/30 border border-border rounded-md px-3 py-1.5 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          @keydown.enter="sendChat"
        />
        <button
          class="px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-label-lg hover:opacity-90 transition-opacity disabled:opacity-50"
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
import { ref, computed, watch, nextTick, onMounted } from "vue";
import { useCampaignMessages } from "@/composables/useCampaignMessages";
import { useParty } from "@/composables/useParty";
import { useCampaignMembers } from "@/composables/useCampaignMembers";
import { useAuthStore } from "@/stores/auth";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import type { RollMetadata } from "@/types/chat.types";
import type { CampaignMember } from "@/types/campaign.types";
import { formatChatTimestamp } from "@/lib/utils";
import { useLocalePrefs } from "@/composables/useLocalePrefs";

const { messages, loading, sendMessage } = useCampaignMessages();
const { data: partyMembers } = useParty();
const { data: members } = useCampaignMembers();
const auth = useAuthStore();

const chatInput = ref("");
const scrollEl = ref<HTMLElement | null>(null);
const whisperTarget = ref<string>("");

const otherMembers = computed(() =>
  (members.value ?? []).filter((m) => m.user_id !== auth.user?.id),
);

function bestName(member: CampaignMember): string {
  if (member.party_member_id) {
    const character = (partyMembers.value ?? []).find(
      (p) => p.id === member.party_member_id,
    );
    if (character?.name) return character.name;
  }
  const dn = member.display_name;
  if (dn) return dn.includes("@") ? dn.split("@")[0] : dn;
  return member.role === "dm" ? "DM" : "Player";
}

function isNearBottom(): boolean {
  const el = scrollEl.value;
  return !!el && el.scrollHeight - el.scrollTop - el.clientHeight < 48;
}

function scrollToBottom() {
  if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight;
}

// Land on the newest message initially, but retain a reader's position when
// Realtime adds a message while they are looking back through the chat.
onMounted(async () => {
  await nextTick();
  scrollToBottom();
});

watch(
  () => messages.value.length,
  (_, previousLength) => {
    const shouldFollow = previousLength === 0 || isNearBottom();
    if (!shouldFollow) return;
    nextTick(() => {
      scrollToBottom();
    });
  },
);

async function sendChat() {
  const text = chatInput.value.trim();
  if (!text) return;
  chatInput.value = "";
  await sendMessage(text, whisperTarget.value || null);
}

const { chatLocale } = useLocalePrefs();
function formatTime(iso: string) { return formatChatTimestamp(iso, chatLocale.value); }

/** Extract the raw d20 value from metadata, if present. */
function getDice(metadata: RollMetadata): number | null {
  const m = metadata as RollMetadata & { dice?: number };
  if (typeof m.dice === "number") return m.dice;
  if (Array.isArray(m.breakdown) && m.breakdown.length > 0)
    return m.breakdown[0].val;
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
