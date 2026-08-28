<template>
  <div class="flex flex-col h-full min-h-0">
    <!-- Header -->
    <div
      class="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30 shrink-0"
    >
      <div class="flex items-center gap-2">
        <IconMessage class="h-4 w-4 text-primary" />
        <span
          class="text-label-lg font-semibold text-foreground"
          >Campaign Chat</span
        >
        <ManualHelpLink v-if="auth.isDM" page="campaign-chat" />
      </div>
      <div class="flex items-center gap-1">
        <AppButton
          v-if="auth.isDM && messages.length > 0"
          variant="ghost"
          tone="danger"
          size="icon-xs"
          :icon="IconDelete"
          class="text-muted-foreground/50"
          tooltip="Clear all messages"
          @click="$emit('delete-all')"
        />
        <AppButton
          variant="ghost"
          size="icon-xs"
          aria-label="Close chat"
          :icon="IconClose"
          icon-size="md"
          @click="$emit('close')"
        />
      </div>
    </div>

    <!-- Message list -->
    <div
      ref="scrollEl"
      class="flex-1 overflow-y-auto px-3 py-3 space-y-2 min-h-0"
      @scroll="onScroll"
    >
      <div v-if="loadingOlder" class="text-center py-2">
        <LoadingSpinner />
      </div>
      <div v-if="loading" class="text-center py-4">
        <LoadingSpinner />
      </div>
      <div v-else-if="!messages.length" class="text-center py-8">
        <p class="text-caption text-muted-foreground italic">
          No messages yet. Say hello!
        </p>
      </div>
      <template v-else>
        <div
          v-for="msg in displayMessages"
          :key="msg.id"
          :data-message-id="msg.id"
          class="group flex gap-1"
          :class="[
            msg.user_id === myUserId ? 'flex-row-reverse' : 'flex-row',
            msg.id === focusMessageId ? 'rounded-lg ring-2 ring-primary/60' : '',
          ]"
        >
          <!-- Delete button (own messages; DM can delete any) -->
          <AppButton
            v-if="msg.user_id === myUserId || auth.isDM"
            variant="ghost"
            tone="danger"
            fill="tone"
            size="icon-xs"
            class="[@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity shrink-0 self-start text-muted-foreground/40"
            :icon="IconDelete"
            tooltip="Delete message"
            @click="$emit('delete', msg.id)"
          />

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
        <p class="font-cinzel text-2xs text-muted-foreground tracking-widest uppercase">Vendor Offer</p>
        <AppInput
          v-model="vendorDesc"
          type="text"
          tone="muted"
          size="body-xs"
          placeholder="What is being offered? (e.g. Healing Potion)"
          class="bg-muted/30 placeholder:text-muted-foreground/60"
        />
        <!-- Item combobox -->
        <div class="relative">
          <AppInput
            v-model="vendorItemQuery"
            type="text"
            tone="muted"
            size="body-xs"
            placeholder="Vault item to give on payment (optional)"
            autocomplete="off"
            class="bg-muted/30 placeholder:text-muted-foreground/60"
            :class="vendorItemQuery && !vendorItemId ? 'border-amber-500/50' : ''"
            @input="vendorItemId = ''"
            @focus="vendorShowItems = true"
            @keydown.escape="vendorShowItems = false"
          />
          <div
            v-if="vendorShowItems && vendorItemSuggestions.length"
            class="absolute left-0 bottom-full mb-0.5 z-20 w-full rounded border border-border bg-card shadow overflow-hidden max-h-40 overflow-y-auto"
          >
            <AppButton
              v-for="it in vendorItemSuggestions"
              :key="it.id"
              variant="menu"
              size="caption"
              block
              class="items-baseline gap-2"
              @click="vendorItemQuery = it.name; vendorItemId = it.id; vendorShowItems = false"
            >
              <span class="truncate">{{ it.name }}</span>
              <span class="font-cinzel text-2xs text-muted-foreground shrink-0 capitalize">{{ it.item_type }}</span>
            </AppButton>
          </div>
          <div v-if="vendorShowItems" class="fixed inset-0 z-10" @click="vendorShowItems = false" />
        </div>
        <div class="grid grid-cols-5 gap-1">
          <div v-for="coin in COINS" :key="coin.key" class="flex flex-col items-center gap-0.5">
            <span class="font-cinzel text-2xs font-bold" :class="coin.color">{{ coin.symbol }}</span>
            <AppInput
              v-model.number="vendorPrice[coin.key]"
              type="number"
              min="0"
              tone="muted"
              size="xs"
              align="center"
              class="bg-muted/30 px-1"
            />
          </div>
        </div>
        <button
          type="button"
          :disabled="!vendorDesc.trim() || !vendorHasPrice"
          class="w-full py-1.5 text-label-lg font-bold bg-emerald-600 text-white rounded-md hover:opacity-90 transition-opacity disabled:opacity-40"
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
      <span class="text-label text-muted-foreground shrink-0">As:</span>
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
        class="text-label text-muted-foreground shrink-0"
        >To:</span
      >
      <AppSelect
        v-model="whisperTarget"
        tone="muted"
        size="caption"
        weight="normal"
        class="flex-1"
      >
        <option value="">Everyone</option>
        <option v-for="m in otherMembers" :key="m.id" :value="m.user_id">
          {{ bestName(m) }} (whisper)
        </option>
      </AppSelect>
    </div>

    <!-- Input bar -->
    <div
      class="shrink-0 border-t border-border bg-card px-2 py-2 flex items-end gap-1.5"
    >
      <AppButton
        variant="ghost"
        size="icon-sm"
        class="shrink-0"
        :active="diceOpen"
        tooltip="Dice roller"
        :icon="IconDiceRoll"
        icon-size="md"
        @click="diceOpen = !diceOpen; vendorOpen = false"
      />
      <AppButton
        v-if="auth.isDM"
        variant="ghost"
        size="icon-sm"
        fill="muted"
        tone="success"
        :active="vendorOpen"
        class="shrink-0"
        tooltip="Vendor offer"
        :icon="IconShop"
        icon-size="md"
        @click="vendorOpen = !vendorOpen; diceOpen = false"
      />
      <textarea
        ref="inputEl"
        v-model="inputText"
        rows="1"
        :placeholder="whisperTarget ? 'Whisper…' : 'Type a message…'"
        class="flex-1 resize-none bg-muted/40 border border-border rounded-md px-3 py-2 text-body text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring leading-snug overflow-hidden"
        :class="whisperTarget ? 'border-amber-500/40 bg-amber-500/5' : ''"
        style="max-height: 5rem; min-height: 2rem"
        @keydown.enter.exact.prevent="send"
        @input="autoResize"
      />
      <AppButton
        variant="primary"
        size="icon-sm"
        class="shrink-0 disabled:opacity-40"
        :disabled="!inputText.trim()"
        :icon="IconSend"
        icon-size="md"
        @click="send"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick, shallowRef, onMounted } from "vue";
import { renderChatMessage } from "@/lib/chatMarkdown";
import { IconClose, IconDelete, IconDiceRoll, IconMessage, IconSend, IconShop } from '@/lib/icons';
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import { usePromptedRoll } from "@/composables/dice/usePromptedRoll";
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
import type { DieSize, RollMode, RollResult } from "@/lib/dice/dice";
import { useItems, useEnsureOwnedItem } from "@/composables/items/useItems";
import { COINS, type CoinKey, toCP } from "@/rules/currency";
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
  loadingOlder: boolean;
  hasOlder: boolean;
  myUserId: string;
  members: CampaignMember[] | undefined;
  party: PartyMember[] | undefined;
  npcs: { id: string; name: string }[];
  focusMessageId?: string | null;
  focusRequest?: number;
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
  "load-older": [];
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
const { ensureOwnedItem } = useEnsureOwnedItem();
const vendorItemSuggestions = computed(() => {
  const q = vendorItemQuery.value.trim().toLowerCase();
  const all = allVaultItems.value ?? [];
  if (!q) return all.slice(0, 8);
  return all.filter(it => it.name.toLowerCase().includes(q)).slice(0, 8);
});

const vendorPrice = reactive<Record<CoinKey, number>>({ pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 });
const vendorHasPrice = computed(() => COINS.some(c => vendorPrice[c.key] > 0));

async function postVendorOffer() {
  if (!vendorDesc.value.trim()) return;
  const selectedItem = vendorItemId.value
    ? (allVaultItems.value ?? []).find(it => it.id === vendorItemId.value) ?? null
    : null;
  // A paid offer lands in party_inventory.item_id (hard FK) via handlePayVendorOffer
  // — the id embedded in the offer's chat metadata must already be owned.
  const owned = selectedItem ? await ensureOwnedItem(selectedItem) : null;
  emit("send-vendor-offer", {
    description: vendorDesc.value.trim(),
    itemName: selectedItem?.name ?? null,
    itemId: owned?.id ?? null,
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
let prependAnchor: { height: number; top: number } | null = null;

function scrollToBottom() {
  if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight;
}

function isNearBottom(): boolean {
  const el = scrollEl.value;
  return !!el && el.scrollHeight - el.scrollTop - el.clientHeight < 48;
}

function onScroll() {
  const el = scrollEl.value;
  if (!el || el.scrollTop > 80 || props.loadingOlder || !props.hasOlder) return;
  // The older page is prepended, so restore this exact viewport position once
  // Vue has rendered it rather than making the reader jump into the new rows.
  prependAnchor = { height: el.scrollHeight, top: el.scrollTop };
  emit("load-older");
}

watch(
  () => props.loadingOlder,
  async (isLoading, wasLoading) => {
    if (isLoading || !wasLoading || !prependAnchor || !scrollEl.value) return;
    const anchor = prependAnchor;
    prependAnchor = null;
    await nextTick();
    const el = scrollEl.value;
    if (el) el.scrollTop = anchor.top + (el.scrollHeight - anchor.height);
  },
);

// `messages.length` is in the key because the requested message may not be
// loaded yet when the jump is requested — each arrival is another chance to
// find it. Once found, the request is spent: without that, every later message,
// roll or loot drop would drag the panel back off the live conversation.
let focusedKey = "";
watch(
  () => [props.focusMessageId, props.focusRequest, props.messages.length] as const,
  async ([messageId, request]) => {
    if (!messageId) return;
    const key = `${messageId}:${request ?? 0}`;
    if (key === focusedKey) return;
    await nextTick();
    const target = [...(scrollEl.value?.querySelectorAll<HTMLElement>("[data-message-id]") ?? [])]
      .find((element) => element.dataset.messageId === messageId);
    if (!target) return;
    focusedKey = key;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  },
  { immediate: true },
);

// Scroll to bottom on initial open (messages already loaded)
onMounted(async () => {
  await nextTick();
  scrollToBottom();
});

// Auto-scroll when new messages arrive
watch(
  () => props.messages.length,
  async (_, previousLength) => {
    if (previousLength > 0 && !isNearBottom()) return;
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
  max-height: 18.75rem;
}
.dice-expand-enter-from,
.dice-expand-leave-to {
  max-height: 0;
  opacity: 0;
}
</style>
