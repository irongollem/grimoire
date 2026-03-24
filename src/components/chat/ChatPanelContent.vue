<template>
  <div class="flex flex-col h-full min-h-0">
    <!-- Header -->
    <div
      class="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30 shrink-0"
    >
      <div class="flex items-center gap-2">
        <MessageCircle class="h-4 w-4 text-primary" />
        <span
          class="font-cinzel text-xs font-semibold text-foreground tracking-wider"
          >Campaign Chat</span
        >
      </div>
      <div class="flex items-center gap-1">
        <button
          v-if="auth.isDM && messages.length > 0"
          type="button"
          class="text-muted-foreground/50 hover:text-destructive transition-colors p-1 rounded"
          title="Clear all messages"
          @click="$emit('delete-all')"
        >
          <Trash2 class="h-3.5 w-3.5" />
        </button>
        <button
          class="text-muted-foreground hover:text-foreground transition-colors p-1"
          @click="$emit('close')"
        >
          <X class="h-4 w-4" />
        </button>
      </div>
    </div>

    <!-- Message list -->
    <div
      ref="scrollEl"
      class="flex-1 overflow-y-auto px-3 py-3 space-y-2 min-h-0"
    >
      <div v-if="loading" class="text-center py-4">
        <LoadingSpinner />
      </div>
      <div v-else-if="!messages.length" class="text-center py-8">
        <p class="font-fell text-xs text-muted-foreground italic">
          No messages yet. Say hello!
        </p>
      </div>
      <template v-else>
        <div
          v-for="msg in messages"
          :key="msg.id"
          class="group flex gap-1"
          :class="msg.user_id === myUserId ? 'flex-row-reverse' : 'flex-row'"
        >
          <!-- Delete button (own messages; DM can delete any) -->
          <button
            v-if="msg.user_id === myUserId || auth.isDM"
            type="button"
            class="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 self-start p-1.5 rounded hover:bg-destructive/10 text-muted-foreground/40 hover:text-destructive"
            title="Delete message"
            @click="$emit('delete', msg.id)"
          >
            <Trash2 class="h-3.5 w-3.5" />
          </button>

          <!-- Item drop message -->
          <div
            v-if="msg.type === 'item_drop'"
            class="max-w-[90%] rounded-lg border overflow-hidden"
            :class="
              (msg.metadata as ItemDropMetadata)?.claimed_by_user_id
                ? 'border-border bg-muted/40'
                : 'border-amber-500/30 bg-amber-500/5'
            "
          >
            <div
              class="px-3 py-2 border-b border-border/50 flex items-center gap-2"
            >
              <Gift class="h-3.5 w-3.5 text-amber-400 shrink-0" />
              <span
                class="font-cinzel text-[10px] text-muted-foreground tracking-wider"
              >
                {{ msg.user_id === myUserId ? "You" : msg.sender_name }} dropped
                loot
              </span>
            </div>
            <div class="px-3 py-2.5">
              <div class="flex items-baseline gap-2 mb-1">
                <span class="font-fell text-sm font-semibold text-foreground">
                  {{
                    (msg.metadata as ItemDropMetadata)?.quantity > 1
                      ? `${(msg.metadata as ItemDropMetadata).quantity}× `
                      : ""
                  }}{{ (msg.metadata as ItemDropMetadata)?.item_name }}
                </span>
                <span
                  v-if="(msg.metadata as ItemDropMetadata)?.item_rarity"
                  class="font-cinzel text-[10px] text-muted-foreground capitalize tracking-wide"
                >
                  {{ (msg.metadata as ItemDropMetadata)?.item_rarity }}
                </span>
              </div>
              <!-- Claimed state -->
              <div
                v-if="(msg.metadata as ItemDropMetadata)?.claimed_by_user_id"
                class="font-fell text-xs text-muted-foreground italic"
              >
                Claimed by
                {{ (msg.metadata as ItemDropMetadata)?.claimed_by_name }}
                <span
                  v-if="
                    !(msg.metadata as ItemDropMetadata)?.claimed_party_member_id
                  "
                >
                  (party stash)</span
                >
              </div>
              <!-- Claim buttons (only if unclaimed and not the sender) -->
              <div v-else class="flex flex-wrap gap-1.5 mt-2">
                <button
                  type="button"
                  class="px-2.5 py-1 rounded bg-amber-500/20 border border-amber-500/40 font-cinzel text-[10px] text-amber-400 hover:bg-amber-500/30 transition-colors tracking-wider"
                  @click="
                    $emit('claim', { messageId: msg.id, intoStash: false })
                  "
                >
                  Claim
                </button>
                <button
                  type="button"
                  class="px-2.5 py-1 rounded border border-border font-cinzel text-[10px] text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors tracking-wider"
                  @click="
                    $emit('claim', { messageId: msg.id, intoStash: true })
                  "
                >
                  To Stash
                </button>
                <select
                  v-if="auth.isDM && props.npcs.length > 0"
                  class="px-2 py-1 rounded border border-border bg-card font-cinzel text-[10px] text-muted-foreground hover:border-primary/40 focus:outline-none focus:ring-1 focus:ring-ring transition-colors cursor-pointer"
                  @change="onClaimToNpc(msg.id, $event)"
                >
                  <option value="">To NPC…</option>
                  <option v-for="npc in props.npcs" :key="npc.id" :value="npc.id">{{ npc.name }}</option>
                </select>
              </div>
              <p class="font-fell text-[10px] text-muted-foreground/50 mt-1.5">
                {{ timeLabel(msg.created_at) }}
              </p>
            </div>
          </div>

          <!-- Currency drop message -->
          <div
            v-else-if="msg.type === 'currency_drop'"
            class="max-w-[90%] rounded-lg border overflow-hidden"
            :class="
              (msg.metadata as CurrencyDropMetadata)?.claimed_by_user_id
                ? 'border-border bg-muted/40'
                : 'border-amber-500/30 bg-amber-500/5'
            "
          >
            <div
              class="px-3 py-2 border-b border-border/50 flex items-center gap-2"
            >
              <Coins class="h-3.5 w-3.5 text-amber-400 shrink-0" />
              <span
                class="font-cinzel text-[10px] text-muted-foreground tracking-wider"
              >
                {{ msg.user_id === myUserId ? "You" : msg.sender_name }} dropped
                currency
              </span>
            </div>
            <div class="px-3 py-2.5">
              <p
                v-if="(msg.metadata as CurrencyDropMetadata)?.label"
                class="font-cinzel text-xs font-semibold text-foreground mb-1"
              >{{ (msg.metadata as CurrencyDropMetadata).label }}</p>
              <div class="flex flex-wrap gap-2 mb-1">
                <span
                  v-if="(msg.metadata as CurrencyDropMetadata)?.pp"
                  class="font-fell text-sm font-semibold"
                  style="color: #a855f7"
                  >{{ (msg.metadata as CurrencyDropMetadata).pp }} PP</span
                >
                <span
                  v-if="(msg.metadata as CurrencyDropMetadata)?.gp"
                  class="font-fell text-sm font-semibold"
                  style="color: #f59e0b"
                  >{{ (msg.metadata as CurrencyDropMetadata).gp }} GP</span
                >
                <span
                  v-if="(msg.metadata as CurrencyDropMetadata)?.ep"
                  class="font-fell text-sm font-semibold"
                  style="color: #60a5fa"
                  >{{ (msg.metadata as CurrencyDropMetadata).ep }} EP</span
                >
                <span
                  v-if="(msg.metadata as CurrencyDropMetadata)?.sp"
                  class="font-fell text-sm font-semibold"
                  style="color: #9ca3af"
                  >{{ (msg.metadata as CurrencyDropMetadata).sp }} SP</span
                >
                <span
                  v-if="(msg.metadata as CurrencyDropMetadata)?.cp"
                  class="font-fell text-sm font-semibold"
                  style="color: #b45309"
                  >{{ (msg.metadata as CurrencyDropMetadata).cp }} CP</span
                >
              </div>
              <div
                v-if="
                  (msg.metadata as CurrencyDropMetadata)?.claimed_by_user_id
                "
                class="font-fell text-xs text-muted-foreground italic"
              >
                Added to purse by
                {{ (msg.metadata as CurrencyDropMetadata)?.claimed_by_name }}
              </div>
              <button
                v-else-if="msg.user_id !== myUserId"
                type="button"
                class="mt-2 px-2.5 py-1 rounded bg-amber-500/20 border border-amber-500/40 font-cinzel text-[10px] text-amber-400 hover:bg-amber-500/30 transition-colors tracking-wider"
                @click="$emit('claim-currency', { messageId: msg.id })"
              >
                Add to Purse
              </button>
              <p class="font-fell text-[10px] text-muted-foreground/50 mt-1.5">
                {{ timeLabel(msg.created_at) }}
              </p>
            </div>
          </div>

          <!-- Roll message -->
          <div
            v-else-if="msg.type === 'roll'"
            class="max-w-[90%] rounded-lg px-3 py-2"
            :class="
              msg.user_id === myUserId
                ? 'bg-primary/15 border border-primary/20'
                : 'bg-muted/60 border border-border'
            "
          >
            <!-- Sender row -->
            <p
              class="font-cinzel text-[10px] text-muted-foreground tracking-wider mb-1.5"
            >
              <span class="font-semibold text-primary">{{
                msg.user_id === myUserId ? "You" : msg.sender_name
              }}</span>
              <span v-if="msg.recipient_user_id" class="text-amber-400">
                whispers</span
              >
              {{ " " }}rolled {{ asRoll(msg.metadata).label }}
            </p>
            <!-- Horizontal layout: total left, breakdown right -->
            <div class="flex items-center gap-3">
              <!-- Big total -->
              <div
                class="shrink-0 flex flex-col items-center justify-center w-14 h-14 rounded-lg border"
                :class="
                  asRoll(msg.metadata).isCrit
                    ? 'border-amber-400/50 bg-amber-400/10'
                    : asRoll(msg.metadata).isFumble
                      ? 'border-destructive/50 bg-destructive/10'
                      : msg.user_id === myUserId
                        ? 'border-primary/30 bg-primary/10'
                        : 'border-border bg-muted/40'
                "
              >
                <span
                  class="font-cinzel text-2xl font-bold leading-none"
                  :class="
                    asRoll(msg.metadata).isCrit
                      ? 'text-amber-400'
                      : asRoll(msg.metadata).isFumble
                        ? 'text-destructive'
                        : 'text-foreground'
                  "
                  >{{ asRoll(msg.metadata).total ?? "?" }}</span
                >
                <span
                  v-if="asRoll(msg.metadata).isCrit"
                  class="font-cinzel text-[8px] text-amber-400 tracking-widest mt-0.5"
                  >CRIT</span
                >
                <span
                  v-else-if="asRoll(msg.metadata).isFumble"
                  class="font-cinzel text-[8px] text-destructive tracking-widest mt-0.5"
                  >FAIL</span
                >
              </div>
              <!-- Breakdown + meta -->
              <div class="flex-1 min-w-0">
                <div
                  v-if="asRoll(msg.metadata).breakdown?.length"
                  class="flex flex-wrap gap-1 mb-1"
                >
                  <span
                    v-for="(d, i) in asRoll(msg.metadata).breakdown"
                    :key="i"
                    class="font-cinzel text-[10px] px-1.5 py-0.5 rounded"
                    :class="
                      d.dropped
                        ? 'line-through text-muted-foreground/30 bg-muted/30'
                        : 'bg-muted text-foreground'
                    "
                    >{{ d.val }}</span
                  >
                  <span
                    v-if="asRoll(msg.metadata).modifier !== 0"
                    class="font-cinzel text-[10px] text-primary px-1"
                  >
                    {{
                      asRoll(msg.metadata).modifier > 0
                        ? `+${asRoll(msg.metadata).modifier}`
                        : asRoll(msg.metadata).modifier
                    }}
                  </span>
                </div>
                <p class="font-fell text-[10px] text-muted-foreground/50">
                  {{ timeLabel(msg.created_at) }}
                </p>
              </div>
            </div>
          </div>

          <!-- Chat message -->
          <div
            v-else
            class="max-w-[80%] rounded-lg px-3 py-2"
            :class="
              msg.user_id === myUserId
                ? 'bg-primary/15 border border-primary/20'
                : 'bg-muted/60 border border-border'
            "
          >
            <div
              v-if="msg.user_id !== myUserId || msg.recipient_user_id"
              class="flex items-center gap-1 mb-0.5"
            >
              <p
                class="font-cinzel text-[10px] font-semibold tracking-wider text-primary"
              >
                {{ msg.user_id === myUserId ? "You" : msg.sender_name }}
              </p>
              <span
                v-if="msg.recipient_user_id"
                class="font-fell text-[10px] text-amber-400 italic"
              >
                → {{ recipientName(msg.recipient_user_id) }}
              </span>
            </div>
            <p class="font-fell text-sm text-foreground leading-snug">
              {{ msg.message }}
            </p>
            <p
              class="font-fell text-[10px] text-muted-foreground/50 mt-0.5 text-right"
            >
              {{ timeLabel(msg.created_at) }}
            </p>
          </div>
        </div>
      </template>
    </div>

    <!-- Dice panel -->
    <Transition name="dice-expand">
      <div
        v-if="diceOpen"
        class="shrink-0 border-t border-border bg-muted/20 px-3 py-2 space-y-2"
      >
        <div class="flex flex-wrap gap-1">
          <button
            v-for="d in ALL_DICE"
            :key="d"
            type="button"
            class="h-7 w-9 rounded border font-cinzel text-[10px] font-bold transition-colors"
            :class="
              (diceCounts[d] ?? 0) > 0
                ? 'border-primary/60 bg-primary/15 text-primary'
                : 'border-border bg-muted/40 text-muted-foreground hover:border-primary/40'
            "
            @click="toggleDie(d)"
          >
            d{{ d }}
          </button>
        </div>
        <div v-if="totalDice > 0" class="flex flex-wrap gap-2">
          <div v-for="d in ALL_DICE" :key="d" class="flex items-center gap-1">
            <template v-if="(diceCounts[d] ?? 0) > 0">
              <span class="font-cinzel text-[10px] text-muted-foreground"
                >d{{ d }}:</span
              >
              <button type="button" class="count-btn" @click="decrement(d)">
                −
              </button>
              <span
                class="font-cinzel text-xs font-bold text-foreground w-4 text-center"
                >{{ diceCounts[d] }}</span
              >
              <button type="button" class="count-btn" @click="increment(d)">
                +
              </button>
            </template>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span class="font-cinzel text-[10px] text-muted-foreground"
            >Mod:</span
          >
          <button type="button" class="count-btn" @click="diceModifier--">
            −
          </button>
          <input
            v-model.number="diceModifier"
            type="number"
            class="w-10 text-center bg-background border border-border rounded px-1 py-0.5 font-cinzel text-xs font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button type="button" class="count-btn" @click="diceModifier++">
            +
          </button>
          <div
            class="flex rounded border border-border overflow-hidden ml-auto"
          >
            <button
              v-for="m in MODES"
              :key="m.value"
              type="button"
              class="px-2 py-0.5 font-cinzel text-[9px] font-bold tracking-wider transition-colors"
              :class="
                diceMode === m.value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              "
              @click="diceMode = m.value"
            >
              {{ m.label }}
            </button>
          </div>
        </div>
        <button
          type="button"
          :disabled="totalDice === 0"
          class="w-full py-1.5 font-cinzel text-xs font-bold tracking-wider bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity disabled:opacity-40"
          @click="rollAndPost"
        >
          🎲 Roll &amp; Post
        </button>
      </div>
    </Transition>

    <!-- Whisper target selector -->
    <div
      v-if="members && members.length > 1"
      class="pb-2 shrink-0 px-2 pt-1.5 flex items-center gap-2"
    >
      <span
        class="font-cinzel text-[10px] text-muted-foreground tracking-wider shrink-0"
        >To:</span
      >
      <select
        v-model="whisperTarget"
        class="flex-1 bg-muted/40 border border-border rounded px-2 py-0.5 font-fell text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="">Everyone</option>
        <option v-for="m in otherMembers" :key="m.id" :value="m.user_id">
          {{ bestName(m) }} (whisper)
        </option>
      </select>
    </div>

    <!-- Input bar -->
    <div
      class="shrink-0 border-t border-border bg-card px-2 py-2 flex items-end gap-1.5"
    >
      <button
        type="button"
        class="p-1.5 rounded-md transition-colors shrink-0"
        :class="
          diceOpen
            ? 'text-primary bg-primary/10'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
        "
        title="Dice roller"
        @click="diceOpen = !diceOpen"
      >
        <Dices class="h-4 w-4" />
      </button>
      <textarea
        ref="inputEl"
        v-model="inputText"
        rows="1"
        :placeholder="whisperTarget ? 'Whisper…' : 'Type a message…'"
        class="flex-1 resize-none bg-muted/40 border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring leading-snug overflow-hidden"
        :class="whisperTarget ? 'border-amber-500/40 bg-amber-500/5' : ''"
        style="max-height: 80px; min-height: 2rem"
        @keydown.enter.exact.prevent="send"
        @input="autoResize"
      />
      <button
        type="button"
        :disabled="!inputText.trim()"
        class="p-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40 shrink-0"
        @click="send"
      >
        <Send class="h-4 w-4" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick } from "vue";
import {
  MessageCircle,
  X,
  Send,
  Dices,
  Trash2,
  Gift,
  Coins,
} from "lucide-vue-next";
import { rollDice, ALL_DICE } from "@/lib/dice";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import type {
  CampaignMessage,
  ItemDropMetadata,
  CurrencyDropMetadata,
  RollMetadata,
} from "@/types/chat.types";

function asRoll(m: CampaignMessage["metadata"]): RollMetadata {
  return m as RollMetadata;
}
import type { CampaignMember } from "@/types/campaign.types";
import type { PartyMember } from "@/types/party.types";
import type { DieSize, RollMode, RollResult } from "@/lib/dice";
import { useAuthStore } from "@/stores/auth";

const props = defineProps<{
  messages: CampaignMessage[];
  loading: boolean;
  myUserId: string;
  members: CampaignMember[] | undefined;
  party: PartyMember[] | undefined;
  npcs: { id: string; name: string }[];
}>();

const emit = defineEmits<{
  close: [];
  send: [payload: { text: string; recipientUserId: string | null }];
  sendRoll: [payload: { result: RollResult; recipientUserId: string | null }];
  delete: [id: string];
  "delete-all": [];
  claim: [payload: { messageId: string; intoStash: boolean }];
  "claim-currency": [payload: { messageId: string }];
  "claim-to-npc": [payload: { messageId: string; npcId: string; npcName: string }];
}>();

function onClaimToNpc(messageId: string, e: Event) {
  const sel = e.target as HTMLSelectElement;
  const npcId = sel.value;
  if (!npcId) return;
  const npc = props.npcs.find((n) => n.id === npcId);
  if (!npc) return;
  emit("claim-to-npc", { messageId, npcId, npcName: npc.name });
  sel.value = "";
}

const auth = useAuthStore();

const scrollEl = ref<HTMLElement | null>(null);
const inputEl = ref<HTMLTextAreaElement | null>(null);

// Auto-scroll when messages change
watch(
  () => props.messages.length,
  async () => {
    await nextTick();
    if (scrollEl.value) {
      scrollEl.value.scrollTop = scrollEl.value.scrollHeight;
    }
  },
  { immediate: true },
);

// ── Members for whisper ────────────────────────────────────────────────────────
const otherMembers = computed(() =>
  (props.members ?? []).filter((m) => m.user_id !== auth.user?.id),
);

/** Priority: linked character name → display_name → email prefix → "Player" */
function bestName(member: CampaignMember): string {
  if (member.party_member_id) {
    const character = (props.party ?? []).find(
      (p) => p.id === member.party_member_id,
    );
    if (character?.name) return character.name;
  }
  const dn = member.display_name;
  if (dn) return dn.includes("@") ? dn.split("@")[0] : dn;
  return "Player";
}

function recipientName(userId: string): string {
  const m = (props.members ?? []).find((m) => m.user_id === userId);
  return m ? bestName(m) : "Player";
}

// ── Whisper target ─────────────────────────────────────────────────────────────
const whisperTarget = ref<string>("");

// ── Input ──────────────────────────────────────────────────────────────────────
const inputText = ref("");

function autoResize(e: Event) {
  const el = e.target as HTMLTextAreaElement;
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 80) + "px";
}

function send() {
  if (!inputText.value.trim()) return;
  emit("send", {
    text: inputText.value,
    recipientUserId: whisperTarget.value || null,
  });
  inputText.value = "";
  if (inputEl.value) inputEl.value.style.height = "auto";
}

// ── Dice ───────────────────────────────────────────────────────────────────────
const diceOpen = ref(false);
const diceCounts = reactive<Partial<Record<DieSize, number>>>({});
const diceModifier = ref(0);
const diceMode = ref<RollMode>("normal");

const MODES: { value: RollMode; label: string }[] = [
  { value: "disadvantage", label: "DIS" },
  { value: "normal", label: "NRM" },
  { value: "advantage", label: "ADV" },
];

const totalDice = computed(() =>
  ALL_DICE.reduce((s, d) => s + (diceCounts[d] ?? 0), 0),
);

function toggleDie(d: DieSize) {
  diceCounts[d] = (diceCounts[d] ?? 0) > 0 ? 0 : 1;
}
function increment(d: DieSize) {
  diceCounts[d] = Math.min((diceCounts[d] ?? 0) + 1, 9);
}
function decrement(d: DieSize) {
  diceCounts[d] = Math.max((diceCounts[d] ?? 0) - 1, 0);
}

function rollAndPost() {
  if (totalDice.value === 0) return;
  const result = rollDice(diceCounts, diceModifier.value, diceMode.value);
  emit("sendRoll", { result, recipientUserId: whisperTarget.value || null });
}

// ── Time ───────────────────────────────────────────────────────────────────────
function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
</script>

<style scoped>
@reference "@/assets/main.css";

.count-btn {
  @apply w-5 h-5 rounded bg-muted border border-border font-cinzel text-xs flex items-center justify-center hover:bg-card transition-colors leading-none;
}

.dice-expand-enter-active,
.dice-expand-leave-active {
  transition:
    max-height 0.2s ease,
    opacity 0.15s ease;
  overflow: hidden;
  max-height: 300px;
}
.dice-expand-enter-from,
.dice-expand-leave-to {
  max-height: 0;
  opacity: 0;
}
</style>
