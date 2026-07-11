<template>
  <div class="flex flex-col h-full min-h-0">
    <!-- Header -->
    <div
      class="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30 shrink-0"
    >
      <div class="flex items-center gap-2">
        <IconMessage class="h-4 w-4 text-primary" />
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
          <IconDelete class="h-3.5 w-3.5" />
        </button>
        <button
          class="text-muted-foreground hover:text-foreground transition-colors p-1"
          @click="$emit('close')"
        >
          <IconClose class="h-4 w-4" />
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
          v-for="msg in displayMessages"
          :key="msg.id"
          class="group flex gap-1"
          :class="msg.user_id === myUserId ? 'flex-row-reverse' : 'flex-row'"
        >
          <!-- Delete button (own messages; DM can delete any) -->
          <button
            v-if="msg.user_id === myUserId || auth.isDM"
            type="button"
            class="[@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity shrink-0 self-start p-1.5 rounded hover:bg-destructive/10 text-muted-foreground/40 hover:text-destructive"
            title="Delete message"
            @click="$emit('delete', msg.id)"
          >
            <IconDelete class="h-3.5 w-3.5" />
          </button>

          <!-- Item drop message -->
          <ChatItemDropMessage
            v-if="msg.type === 'item_drop'"
            :message-id="msg.id"
            :meta="msg.metadata as ItemDropMetadata"
            :sender-name="msg.sender_name"
            :expanded="expandedItems.has(msg.id)"
            :is-d-m="auth.isDM"
            :linked-party-member-id="auth.linkedPartyMemberId"
            :npcs="props.npcs"
            :npc-select-value="npcSelectState[msg.id] ?? ''"
            :time-label="timeLabel(msg.created_at)"
            @toggle-details="toggleDetails"
            @claim="$emit('claim', $event)"
            @grab="$emit('grab', $event)"
            @claim-to-npc="onClaimToNpc(msg.id, $event.npcId)"
          />

          <!-- Vendor offer message -->
          <ChatVendorOfferMessage
            v-else-if="msg.type === 'vendor_offer'"
            :message-id="msg.id"
            :meta="msg.metadata as VendorOfferMetadata"
            :sender-name="msg.sender_name"
            :linked-party-member-id="auth.linkedPartyMemberId"
            :can-afford="canAffordOffer(msg.metadata as VendorOfferMetadata)"
            :time-label="timeLabel(msg.created_at)"
            @pay-vendor-offer="$emit('pay-vendor-offer', $event)"
          />

          <!-- Player offer message -->
          <ChatPlayerOfferMessage
            v-else-if="msg.type === 'player_offer'"
            :message-id="msg.id"
            :meta="msg.metadata as PlayerOfferMetadata"
            :sender-name="msg.sender_name"
            :is-d-m="auth.isDM"
            :can-buy="auth.isDM || (!!auth.linkedPartyMemberId && auth.linkedPartyMemberId !== (msg.metadata as PlayerOfferMetadata)?.seller_party_member_id)"
            :can-afford="canAffordOffer(msg.metadata as PlayerOfferMetadata)"
            :time-label="timeLabel(msg.created_at)"
            @buy-player-offer="$emit('buy-player-offer', $event)"
          />

          <!-- Loot chest message -->
          <ChatLootChestMessage
            v-else-if="msg.type === 'loot_chest'"
            :message-id="msg.id"
            :meta="msg.metadata as LootChestMetadata"
            :sender-name="msg.sender_name"
            :linked-party-member-id="auth.linkedPartyMemberId"
            @claim-loot-chest="emit('claim-loot-chest', $event)"
          />

          <!-- Currency drop message -->
          <ChatCurrencyDropMessage
            v-else-if="msg.type === 'currency_drop'"
            :message-id="msg.id"
            :meta="msg.metadata as CurrencyDropMetadata"
            :sender-name="msg.sender_name"
            :can-claim="msg.user_id !== myUserId && !!auth.linkedPartyMemberId"
            :time-label="timeLabel(msg.created_at)"
            @claim-currency="$emit('claim-currency', $event)"
          />

          <!-- Roll / dm_roll message -->
          <ChatRollMessage
            v-else-if="msg.type === 'roll' || msg.type === 'dm_roll'"
            :is-dm-roll="msg.type === 'dm_roll'"
            :is-own="msg.user_id === myUserId"
            :is-whisper="!!msg.recipient_user_id"
            :sender-name="msg.sender_name"
            :roll="asRoll(msg.metadata)"
            :flavor-skill-label="flavorForRoll(msg) ? (flavorForRoll(msg)!.metadata as FlavorMetadata).skill_label : null"
            :flavor-text="flavorForRoll(msg)?.message ?? null"
            :time-label="timeLabel(msg.created_at)"
          />

          <!-- System / plain chat message -->
          <ChatTextMessage
            v-else
            :is-system="msg.type === 'system'"
            :is-own="msg.user_id === myUserId"
            :sender-name="msg.sender_name"
            :recipient-name="msg.recipient_user_id ? recipientName(msg.recipient_user_id) : null"
            :skill-label="(msg.metadata as FlavorMetadata)?.skill_label ?? null"
            :message="msg.message"
            :rendered-message="renderMessage(msg.message)"
            :time-label="timeLabel(msg.created_at)"
            :entity-link="entityLinkFor(msg)"
          />
        </div>
      </template>
    </div>

    <!-- Vendor offer panel (DM only) -->
    <Transition name="dice-expand">
      <div
        v-if="vendorOpen && auth.isDM"
        class="shrink-0 border-t border-border bg-muted/20 px-3 py-2 space-y-2"
      >
        <p class="font-cinzel text-[10px] text-muted-foreground tracking-widest uppercase">Vendor Offer</p>
        <input
          v-model="vendorDesc"
          type="text"
          placeholder="What is being offered? (e.g. Healing Potion)"
          class="w-full bg-muted/30 border border-border rounded px-2 py-1 font-fell text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <!-- Item combobox -->
        <div class="relative">
          <input
            v-model="vendorItemQuery"
            type="text"
            placeholder="Vault item to give on payment (optional)"
            autocomplete="off"
            class="w-full bg-muted/30 border border-border rounded px-2 py-1 font-fell text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
            :class="vendorItemQuery && !vendorItemId ? 'border-amber-500/50' : ''"
            @input="vendorItemId = ''"
            @focus="vendorShowItems = true"
            @keydown.escape="vendorShowItems = false"
          />
          <div
            v-if="vendorShowItems && vendorItemSuggestions.length"
            class="absolute left-0 bottom-full mb-0.5 z-20 w-full rounded border border-border bg-card shadow overflow-hidden max-h-40 overflow-y-auto"
          >
            <button
              v-for="it in vendorItemSuggestions"
              :key="it.id"
              type="button"
              class="w-full text-left px-2 py-1 font-fell text-xs text-foreground hover:bg-muted transition-colors flex items-baseline gap-2"
              @click="vendorItemQuery = it.name; vendorItemId = it.id; vendorShowItems = false"
            >
              <span class="truncate">{{ it.name }}</span>
              <span class="font-cinzel text-[9px] text-muted-foreground shrink-0 capitalize">{{ it.item_type }}</span>
            </button>
          </div>
          <div v-if="vendorShowItems" class="fixed inset-0 z-10" @click="vendorShowItems = false" />
        </div>
        <div class="grid grid-cols-5 gap-1">
          <div v-for="coin in COINS" :key="coin.key" class="flex flex-col items-center gap-0.5">
            <span class="font-cinzel text-[9px] font-bold" :class="coin.color">{{ coin.symbol }}</span>
            <input
              v-model.number="vendorPrice[coin.key]"
              type="number" min="0"
              class="w-full bg-muted/30 border border-border rounded px-1 py-0.5 font-cinzel text-xs text-foreground text-center focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
        <button
          type="button"
          :disabled="!vendorDesc.trim() || !vendorHasPrice"
          class="w-full py-1.5 font-cinzel text-xs font-bold tracking-wider bg-emerald-600 text-white rounded-md hover:opacity-90 transition-opacity disabled:opacity-40"
          @click="postVendorOffer"
        >Post Offer</button>
      </div>
    </Transition>

    <!-- Dice panel -->
    <Transition name="dice-expand">
      <ChatDiceRoller
        v-if="diceOpen"
        @roll="onDiceRoll"
      />
    </Transition>

    <!-- DM persona selector -->
    <div
      v-if="auth.isDM"
      class="shrink-0 px-2 pt-1.5 flex items-center gap-2"
    >
      <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider shrink-0">As:</span>
      <EntityCombobox
        :model-value="ui.dmTalkAsNpcId"
        :options="props.npcs"
        placeholder="Myself"
        @update:model-value="onTalkAsChange"
      />
    </div>

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
        @click="diceOpen = !diceOpen; vendorOpen = false"
      >
        <IconDiceRoll class="h-4 w-4" />
      </button>
      <button
        v-if="auth.isDM"
        type="button"
        class="p-1.5 rounded-md transition-colors shrink-0"
        :class="
          vendorOpen
            ? 'text-emerald-400 bg-emerald-500/10'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
        "
        title="Vendor offer"
        @click="vendorOpen = !vendorOpen; diceOpen = false"
      >
        <IconShop class="h-4 w-4" />
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
        <IconSend class="h-4 w-4" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick, shallowRef, onMounted } from "vue";
import { renderChatMessage } from "@/lib/chatMarkdown";
import { IconClose, IconDelete, IconDiceRoll, IconMessage, IconSend, IconShop } from '@/lib/icons';
import { usePromptedRoll } from "@/composables/usePromptedRoll";
import { formatChatTimestamp } from "@/lib/utils";
import { useLocalePrefs } from "@/composables/useLocalePrefs";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import ChatItemDropMessage from "@/components/chat/ChatItemDropMessage.vue";
import ChatCurrencyDropMessage from "@/components/chat/ChatCurrencyDropMessage.vue";
import ChatRollMessage from "@/components/chat/ChatRollMessage.vue";
import ChatTextMessage from "@/components/chat/ChatTextMessage.vue";
import ChatDiceRoller from "@/components/chat/ChatDiceRoller.vue";
import ChatVendorOfferMessage from "@/components/chat/ChatVendorOfferMessage.vue";
import ChatPlayerOfferMessage from "@/components/chat/ChatPlayerOfferMessage.vue";
import ChatLootChestMessage from "@/components/chat/ChatLootChestMessage.vue";
import type {
  CampaignMessage,
  ItemDropMetadata,
  CurrencyDropMetadata,
  VendorOfferMetadata,
  PlayerOfferMetadata,
  FlavorMetadata,
  RollMetadata,
  LootChestMetadata,
  EntityLinkMetadata,
} from "@/types/chat.types";
import type { CampaignMember } from "@/types/campaign.types";
import type { PartyMember } from "@/types/party.types";
import type { DieSize, RollMode, RollResult } from "@/lib/dice";
import { useItems } from "@/composables/useItems";
import { COINS, type CoinKey, toCP } from "@/lib/currency";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";

const ui = useUiStore();

function onTalkAsChange(id: string) {
  const npc = id ? props.npcs.find(n => n.id === id) : null;
  ui.setDmTalkAsNpc(id, npc?.name ?? null);
}

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
  grab: [payload: { messageId: string; qty: number; intoStash: boolean }];
  "claim-currency": [payload: { messageId: string }];
  "claim-to-npc": [payload: { messageId: string; npcId: string; npcName: string }];
  "pay-vendor-offer": [payload: { messageId: string }];
  "send-vendor-offer": [payload: { description: string; itemName: string | null; itemId: string | null; pp: number; gp: number; ep: number; sp: number; cp: number }];
  "buy-player-offer": [payload: { messageId: string }];
  "claim-loot-chest": [payload: { messageId: string; atomId: string }];
}>();

function asRoll(m: CampaignMessage["metadata"]): RollMetadata {
  return m as RollMetadata;
}

function entityLinkFor(msg: CampaignMessage): EntityLinkMetadata | null {
  if (msg.type !== "system") return null;
  const meta = msg.metadata as EntityLinkMetadata | null;
  return meta?.entity_type ? meta : null;
}

const npcSelectState = reactive<Record<string, string>>({});

// ── Vendor offer affordability ─────────────────────────────────────────────────────
const myMember = computed(() =>
  auth.linkedPartyMemberId
    ? (props.party ?? []).find(p => p.id === auth.linkedPartyMemberId) ?? null
    : null
);

function canAffordOffer(meta: { pp: number; gp: number; ep: number; sp: number; cp: number }): boolean {
  const m = myMember.value;
  if (!m) return false;
  const walletCP = toCP(m.pp, m.gp, m.ep, m.sp, m.cp);
  const costCP   = toCP(meta.pp, meta.gp, meta.ep, meta.sp, meta.cp);
  return walletCP >= costCP;
}

// ── Vendor offer form (DM only) ─────────────────────────────────────────────────────
const vendorOpen  = ref(false);
const vendorDesc  = ref("");
const vendorItemQuery = ref("");
const vendorItemId    = ref("");
const vendorShowItems = ref(false);
const { data: allVaultItems } = useItems();
const vendorItemSuggestions = computed(() => {
  const q = vendorItemQuery.value.trim().toLowerCase();
  const all = allVaultItems.value ?? [];
  if (!q) return all.slice(0, 8);
  return all.filter(it => it.name.toLowerCase().includes(q)).slice(0, 8);
});

const vendorPrice = reactive<Record<CoinKey, number>>({ pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 });
const vendorHasPrice = computed(() => COINS.some(c => vendorPrice[c.key] > 0));

function postVendorOffer() {
  if (!vendorDesc.value.trim()) return;
  const selectedItem = vendorItemId.value
    ? (allVaultItems.value ?? []).find(it => it.id === vendorItemId.value) ?? null
    : null;
  emit("send-vendor-offer", {
    description: vendorDesc.value.trim(),
    itemName: selectedItem?.name ?? null,
    itemId: selectedItem?.id ?? null,
    pp: vendorPrice.pp, gp: vendorPrice.gp, ep: vendorPrice.ep,
    sp: vendorPrice.sp, cp: vendorPrice.cp,
  });
  vendorDesc.value = ""; vendorItemQuery.value = ""; vendorItemId.value = "";
  COINS.forEach(c => { vendorPrice[c.key] = 0; });
  vendorOpen.value = false;
}

// ── Item details expand/collapse ───────────────────────────────────────────────
const expandedItems = shallowRef(new Set<string>());
function toggleDetails(messageId: string) {
  const next = new Set(expandedItems.value);
  if (next.has(messageId)) next.delete(messageId);
  else next.add(messageId);
  expandedItems.value = next;
}

function onClaimToNpc(messageId: string, npcId: string) {
  if (!npcId) return;
  const npc = props.npcs.find((n) => n.id === npcId);
  if (!npc) return;
  emit("claim-to-npc", { messageId, npcId, npcName: npc.name });
  npcSelectState[messageId] = "";
}

const auth = useAuthStore();

// Hide the system/flavor message that immediately precedes a dm_roll from the
// same user — it's rendered inline inside the dm_roll card instead.
const displayMessages = computed(() =>
  props.messages.filter((msg, idx) => {
    if (msg.type !== "system") return true;
    if (!(msg.metadata as FlavorMetadata)?.skill_label) return true;
    const next = props.messages[idx + 1];
    return !(next?.type === "dm_roll" && next.user_id === msg.user_id);
  }),
);

function flavorForRoll(msg: CampaignMessage): CampaignMessage | null {
  const idx = props.messages.findIndex(m => m.id === msg.id);
  if (idx <= 0) return null;
  const prev = props.messages[idx - 1];
  if (
    prev.type === "system" &&
    prev.user_id === msg.user_id &&
    (prev.metadata as FlavorMetadata)?.skill_label
  ) return prev;
  return null;
}

const scrollEl = ref<HTMLElement | null>(null);
const inputEl = ref<HTMLTextAreaElement | null>(null);

function scrollToBottom() {
  if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight;
}

// Scroll to bottom on initial open (messages already loaded)
onMounted(async () => {
  await nextTick();
  scrollToBottom();
});

// Auto-scroll when new messages arrive
watch(
  () => props.messages.length,
  async () => {
    await nextTick();
    scrollToBottom();
  },
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

const { promptRoll } = usePromptedRoll();

async function onDiceRoll(payload: { counts: Partial<Record<DieSize, number>>; modifier: number; mode: RollMode }) {
  const parts: string[] = [];
  for (const [d, c] of Object.entries(payload.counts)) {
    if ((c ?? 0) > 0) parts.push(`${c}d${d}`);
  }
  if (payload.modifier !== 0)
    parts.push(payload.modifier > 0 ? `+${payload.modifier}` : `${payload.modifier}`);
  const label = parts.join(" + ") || "Roll";
  const result = await promptRoll({
    counts: payload.counts,
    modifier: payload.modifier,
    label,
    mode: payload.mode,
    silent: true,
    recipientUserId: whisperTarget.value || null,
  });
  if (!result) return;
  emit("sendRoll", { result, recipientUserId: whisperTarget.value || null });
}

// ── Time ───────────────────────────────────────────────────────────────────────
const { chatLocale } = useLocalePrefs();
function timeLabel(iso: string) { return formatChatTimestamp(iso, chatLocale.value); }

function renderMessage(text: string): string {
  return renderChatMessage(text);
}
</script>

<style scoped>
@reference "@/assets/main.css";

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
