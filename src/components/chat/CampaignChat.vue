<template>
  <!-- ── Side panel (md+): part of document flow, squashes content ── -->
  <Transition name="side-panel">
    <aside
      v-if="ui.chatOpen"
      class="hidden md:flex flex-col w-80 shrink-0 border-l border-border bg-card"
      :class="props.contained ? 'h-full min-h-0' : 'sticky top-0 h-dvh'"
    >
      <ChatPanelContent
        :messages="messages"
        :loading="loading"
        :my-user-id="myUserId ?? ''"
        :members="members"
        :party="party"
        :npcs="npcs"
        @send="handleSend"
        @send-roll="handleRoll"
        @delete="deleteMessage"
        @delete-all="handleDeleteAll"
        @claim="handleClaim"
        @claim-currency="handleClaimCurrency"
        @claim-to-npc="handleClaimToNpc"
        @pay-vendor-offer="handlePayVendorOffer"
        @send-vendor-offer="handleSendVendorOffer"
        @buy-player-offer="handleBuyPlayerOffer"
        @close="ui.chatOpen = false"
      />
    </aside>
  </Transition>

  <!-- ── Right-edge tab (always visible when panel is closed) ── -->
  <Transition name="tab-fade">
    <button
      v-if="!ui.chatOpen"
      type="button"
      class="chat-no-print fixed right-0 z-40 flex flex-col items-center gap-1.5 px-2 py-3 rounded-l-xl border border-r-0 border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors shadow-lg select-none"
      :style="{ top: tabTop + 'px', touchAction: 'none' }"
      title="Open chat"
      @pointerdown="onTabPointerDown"
    >
      <MessageCircle class="h-4 w-4" />
      <span
        v-if="unread > 0"
        class="h-5 w-5 rounded-full bg-destructive text-destructive-foreground font-cinzel text-[10px] font-bold flex items-center justify-center"
        >{{ unread > 9 ? "9+" : unread }}</span
      >
    </button>
  </Transition>

  <!-- ── Mobile: overlay backdrop + slide-up panel ── -->
  <Transition name="fade">
    <div
      v-if="ui.chatOpen"
      class="chat-no-print fixed inset-0 z-40 bg-black/40 md:hidden"
      @click="ui.chatOpen = false"
    />
  </Transition>
  <Transition name="slide-up">
    <div
      v-if="ui.chatOpen"
      class="chat-no-print fixed bottom-16 inset-x-0 z-50 flex flex-col bg-card border-t border-border rounded-t-2xl md:hidden"
      style="height: 65vh"
    >
      <ChatPanelContent
        :messages="messages"
        :loading="loading"
        :my-user-id="myUserId ?? ''"
        :members="members"
        :party="party"
        :npcs="npcs"
        @send="handleSend"
        @send-roll="handleRoll"
        @delete="deleteMessage"
        @delete-all="handleDeleteAll"
        @claim="handleClaim"
        @claim-currency="handleClaimCurrency"
        @claim-to-npc="handleClaimToNpc"
        @pay-vendor-offer="handlePayVendorOffer"
        @send-vendor-offer="handleSendVendorOffer"
        @buy-player-offer="handleBuyPlayerOffer"
        @close="ui.chatOpen = false"
      />
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted } from "vue";
import { MessageCircle } from "lucide-vue-next";
import { useUiStore } from "@/stores/ui";
import { useCampaignMessages } from "@/composables/useCampaignMessages";
import { useCampaignMembers } from "@/composables/useCampaignMembers";
import { useAuthStore } from "@/stores/auth";
import { useAddInventoryItem, useUpdateInventoryItem, useRemoveInventoryItem } from "@/composables/usePartyInventory";
import { useParty, useUpdatePartyMember } from "@/composables/useParty";
import { useNpcs } from "@/composables/useNpcs";
import { useAddNpcInventoryItem } from "@/composables/useNpcInventory";
import ChatPanelContent from "./ChatPanelContent.vue";
import type { RollResult } from "@/lib/dice";
import type { ItemDropMetadata, CurrencyDropMetadata, VendorOfferMetadata, PlayerOfferMetadata } from "@/types/chat.types";
import { toCP, fromCP } from "@/lib/currency";

const props = withDefaults(defineProps<{ contained?: boolean }>(), { contained: false });

// ── Chat tab vertical drag ──────────────────────────────────────────────────
const CHAT_TAB_TOP_KEY = "grimoire:chat-tab-top";

function clampTabTop(v: number): number {
  return Math.max(8, Math.min(v, window.innerHeight - 100));
}

function getInitialTop(): number {
  const stored = localStorage.getItem(CHAT_TAB_TOP_KEY);
  if (stored) {
    const v = parseFloat(stored);
    if (!isNaN(v)) return clampTabTop(v);
  }
  return Math.round(window.innerHeight * 0.7);
}

const tabTop = ref(0);
const dragState = ref<{ startY: number; startTop: number } | null>(null);

onMounted(() => {
  tabTop.value = getInitialTop();
});

function onTabPointerDown(e: PointerEvent) {
  e.preventDefault();
  dragState.value = { startY: e.clientY, startTop: tabTop.value };
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
}

function onPointerMove(e: PointerEvent) {
  if (!dragState.value) return;
  const delta = e.clientY - dragState.value.startY;
  tabTop.value = clampTabTop(dragState.value.startTop + delta);
}

function onPointerUp(e: PointerEvent) {
  if (!dragState.value) return;
  const delta = Math.abs(e.clientY - dragState.value.startY);
  if (delta < 6) ui.toggleChat();
  localStorage.setItem(CHAT_TAB_TOP_KEY, String(tabTop.value));
  dragState.value = null;
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", onPointerUp);
}

onUnmounted(() => {
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", onPointerUp);
});

const ui = useUiStore();
const auth = useAuthStore();
const { messages, loading, sendMessage, sendRoll, claimItemDrop, claimCurrencyDrop, sendVendorOffer, claimVendorOffer, claimPlayerOffer, deleteMessage, deleteAllMessages, myUserId } =
  useCampaignMessages();
const { data: members } = useCampaignMembers();
const { data: party }   = useParty();
const { data: npcsData } = useNpcs();
const { mutateAsync: addInventoryItem }    = useAddInventoryItem();
const { mutateAsync: updateInventoryItem } = useUpdateInventoryItem();
const { mutateAsync: removeInventoryItem } = useRemoveInventoryItem();
const { mutateAsync: updatePartyMember }   = useUpdatePartyMember();
const { mutateAsync: addNpcInventoryItem } = useAddNpcInventoryItem();

const npcs = computed(() =>
  (npcsData.value ?? []).map((n) => ({ id: n.id, name: n.name }))
);

const unread = ref(0);

watch(messages, (msgs, prev) => {
  if (!ui.chatOpen && msgs.length > (prev?.length ?? 0)) {
    const newest = msgs[msgs.length - 1];
    if (newest?.user_id !== auth.user?.id) unread.value++;
  }
});

watch(
  () => ui.chatOpen,
  (open) => {
    if (open) unread.value = 0;
  },
);

function resolveClaimerName(): string {
  if (ui.dmTalkAsNpcName) return ui.dmTalkAsNpcName;
  if (auth.linkedPartyMemberId) {
    const character = (party.value ?? []).find(p => p.id === auth.linkedPartyMemberId);
    if (character?.name) return character.name;
  }
  const dn = auth.membership?.display_name ?? auth.userEmail;
  if (dn) return dn.includes('@') ? dn.split('@')[0] : dn;
  return 'Someone';
}

async function handleClaim({ messageId, intoStash }: { messageId: string; intoStash: boolean }) {
  const msg = messages.value.find(m => m.id === messageId);
  if (!msg || msg.type !== 'item_drop') return;
  const meta = msg.metadata as ItemDropMetadata;
  if (meta.claimed_by_user_id) return;

  const partyMemberId = intoStash ? null : (auth.linkedPartyMemberId ?? null);
  const claimerName = resolveClaimerName();

  try {
    await claimItemDrop(messageId, claimerName, partyMemberId);
  } catch {
    return; // claim failed (already claimed by someone else or RLS); don't add to inventory
  }
  await addInventoryItem({
    name: meta.item_name,
    quantity: meta.quantity,
    item_id: meta.item_id,
    carried_by: partyMemberId,
    location: 'backpack',
    slot: null,
    is_container: false,
    container_id: null,
    is_ruined: false,
    is_attuned: false,
    is_equipped: false,
    notes: null,
  });
}

async function handleClaimCurrency({ messageId }: { messageId: string }) {
  const msg = messages.value.find(m => m.id === messageId);
  if (!msg || msg.type !== 'currency_drop') return;
  const meta = msg.metadata as CurrencyDropMetadata;
  if (meta.claimed_by_user_id) return;

  const partyMemberId = auth.linkedPartyMemberId ?? null;
  const claimerName = resolveClaimerName();

  await claimCurrencyDrop(messageId, claimerName, partyMemberId);

  // Add coins to the party member's purse if they have one linked
  if (partyMemberId) {
    const member = (party.value ?? []).find(m => m.id === partyMemberId);
    if (member) {
      await updatePartyMember({
        id: partyMemberId,
        update: {
          pp: member.pp + meta.pp,
          gp: member.gp + meta.gp,
          ep: member.ep + meta.ep,
          sp: member.sp + meta.sp,
          cp: member.cp + meta.cp,
        },
      });
    }
  }
}

async function handleSendVendorOffer(payload: { description: string; itemName: string | null; itemId: string | null; pp: number; gp: number; ep: number; sp: number; cp: number }) {
  await sendVendorOffer(payload.description, payload.itemName, payload.itemId, payload.pp, payload.gp, payload.ep, payload.sp, payload.cp);
}

async function handlePayVendorOffer({ messageId }: { messageId: string }) {
  const msg = messages.value.find(m => m.id === messageId);
  if (!msg || msg.type !== 'vendor_offer') return;
  const meta = msg.metadata as VendorOfferMetadata;
  if (meta.paid_by_user_id) return;

  const partyMemberId = auth.linkedPartyMemberId ?? null;
  const member = partyMemberId ? (party.value ?? []).find(m => m.id === partyMemberId) : null;
  if (!member) return;

  const walletCP = toCP(member.pp, member.gp, member.ep, member.sp, member.cp);
  const costCP   = toCP(meta.pp, meta.gp, meta.ep, meta.sp, meta.cp);
  if (walletCP < costCP) return; // button is already disabled; guard against race conditions

  const payerName = resolveClaimerName();
  await claimVendorOffer(messageId, payerName, partyMemberId);

  const { pp, gp, ep, sp, cp } = fromCP(walletCP - costCP);
  await Promise.all([
    updatePartyMember({ id: member.id, update: { pp, gp, ep, sp, cp } }),
    meta.item_name ? addInventoryItem({
      name: meta.item_name, quantity: 1, item_id: meta.item_id,
      carried_by: partyMemberId,
      location: 'backpack', slot: null,
      is_container: false, container_id: null,
      is_attuned: false, is_equipped: false, notes: null, is_ruined: false,
    }) : Promise.resolve(),
  ]);
}

async function handleBuyPlayerOffer({ messageId }: { messageId: string }) {
  const msg = messages.value.find(m => m.id === messageId);
  if (!msg || msg.type !== 'player_offer') return;
  const meta = msg.metadata as PlayerOfferMetadata;
  if (meta.sold_to_user_id || meta.sold_to_name) return;

  const buyerName = resolveClaimerName();
  const buyerPartyMemberId = auth.isDM ? null : (auth.linkedPartyMemberId ?? null);

  await claimPlayerOffer(messageId, buyerName, buyerPartyMemberId);

  const priceCP = toCP(meta.pp, meta.gp, meta.ep, meta.sp, meta.cp);
  const mutations: Promise<unknown>[] = [];

  // Credit the seller
  const seller = (party.value ?? []).find(m => m.id === meta.seller_party_member_id);
  if (seller) {
    const { pp, gp, ep, sp, cp } = fromCP(toCP(seller.pp, seller.gp, seller.ep, seller.sp, seller.cp) + priceCP);
    mutations.push(updatePartyMember({ id: seller.id, update: { pp, gp, ep, sp, cp } }));
  }

  if (auth.isDM) {
    // DM buys: just remove the item from seller (money from thin air)
    mutations.push(removeInventoryItem(meta.inventory_item_id));
  } else if (buyerPartyMemberId) {
    // Player buys: deduct buyer's wallet + transfer item ownership
    const buyer = (party.value ?? []).find(m => m.id === buyerPartyMemberId);
    if (buyer) {
      const { pp, gp, ep, sp, cp } = fromCP(Math.max(0, toCP(buyer.pp, buyer.gp, buyer.ep, buyer.sp, buyer.cp) - priceCP));
      mutations.push(updatePartyMember({ id: buyer.id, update: { pp, gp, ep, sp, cp } }));
    }
    mutations.push(updateInventoryItem({
      id: meta.inventory_item_id,
      update: { carried_by: buyerPartyMemberId, location: 'backpack', slot: null, is_equipped: false },
    }));
  }

  await Promise.all(mutations);
}

async function handleSend({
  text,
  recipientUserId,
}: {
  text: string;
  recipientUserId: string | null;
}) {
  await sendMessage(text, recipientUserId);
}
async function handleRoll({
  result,
  recipientUserId,
}: {
  result: RollResult;
  recipientUserId: string | null;
}) {
  await sendRoll(result, recipientUserId);
}

async function handleClaimToNpc({ messageId, npcId, npcName }: { messageId: string; npcId: string; npcName: string }) {
  const msg = messages.value.find(m => m.id === messageId);
  if (!msg || msg.type !== 'item_drop') return;
  const meta = msg.metadata as ItemDropMetadata;
  if (meta.claimed_by_user_id) return;

  try {
    await claimItemDrop(messageId, npcName, null, npcId);
  } catch {
    return;
  }
  await addNpcInventoryItem({
    npc_id: npcId,
    item_id: meta.item_id,
    name: meta.item_name,
    quantity: meta.quantity,
    notes: null,
  });
}

async function handleDeleteAll() {
  if (!confirm("Delete all messages in this chat? This cannot be undone.")) return;
  await deleteAllMessages();
}
</script>

<style scoped>
.side-panel-enter-active,
.side-panel-leave-active {
  transition:
    width 0.2s ease,
    opacity 0.2s ease;
  overflow: hidden;
}
.side-panel-enter-from,
.side-panel-leave-to {
  width: 0;
  opacity: 0;
}

.tab-fade-enter-active,
.tab-fade-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}
.tab-fade-enter-from,
.tab-fade-leave-to {
  opacity: 0;
  transform: translateX(8px);
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.25s ease;
}
.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Chat tab drag */
button[title="Open chat"] {
  cursor: grab;
}
button[title="Open chat"]:active {
  cursor: grabbing;
}
</style>
