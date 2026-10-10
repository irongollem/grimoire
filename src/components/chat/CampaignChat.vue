<template>
  <!-- ── Side panel (md+): part of document flow, squashes content ── -->
  <Transition v-bind="railTransition()">
    <aside
      v-if="ui.chatOpen"
      class="hidden w-80 shrink-0 md:flex"
      :class="contained ? 'h-full min-h-0' : 'sticky top-0 h-dvh'"
    >
      <!--
        Fixed width, so the panel slides out from the page edge rather than
        rewrapping every message while the rail opens. The border and background
        sit here rather than on the rail for the same reason: chrome that stays
        behind while its contents travel reads as two things moving, not one.
      -->
      <div class="flex w-80 shrink-0 flex-col border-l border-border bg-card">
      <ChatPanelContent
        :messages="messages"
        :loading="loading"
        :loading-older="loadingOlder"
        :has-older="hasOlder"
        :my-user-id="myUserId ?? ''"
        :members="members"
        :party="party"
        :npcs="npcs"
        :focus-message-id="ui.chatFocusMessageId"
        :focus-request="ui.chatFocusRequest"
        :send-text="handleSend"
        @send-roll="handleRoll"
        @delete="handleDelete"
        @delete-all="handleDeleteAll"
        @claim="handleClaim"
        @grab="handleGrab"
        @claim-currency="handleClaimCurrency"
        @claim-to-npc="handleClaimToNpc"
        @claim-loot-chest="handleClaimLootChest"
        @pay-vendor-offer="handlePayVendorOffer"
        @send-vendor-offer="handleSendVendorOffer"
        @buy-player-offer="handleBuyPlayerOffer"
        @load-older="loadOlder"
        @close="ui.chatOpen = false"
      />
      </div>
    </aside>
  </Transition>

  <!-- ── Right-edge tab (always visible when panel is closed, unless hideTab) ── -->
  <Transition name="tab-fade">
    <button
      v-if="!ui.chatOpen && !hideTab"
      type="button"
      class="chat-no-print fixed right-[env(safe-area-inset-right)] z-40 flex flex-col items-center gap-1.5 px-2 py-3 rounded-l-xl border border-r-0 border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors shadow-lg select-none"
      :style="{ top: tabTop + 'px', touchAction: 'none' }"
      title="Open chat"
      @pointerdown="onTabPointerDown"
    >
      <div class="relative">
        <IconMessage class="h-4 w-4" />
        <span v-if="ui.chatHasUnread" class="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-destructive" />
      </div>
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
      class="chat-no-print fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] inset-x-0 z-50 flex flex-col bg-card border-t border-border rounded-t-2xl md:hidden"
      style="height: 65vh"
    >
      <ChatPanelContent
        :messages="messages"
        :loading="loading"
        :loading-older="loadingOlder"
        :has-older="hasOlder"
        :my-user-id="myUserId ?? ''"
        :members="members"
        :party="party"
        :npcs="npcs"
        :focus-message-id="ui.chatFocusMessageId"
        :focus-request="ui.chatFocusRequest"
        :send-text="handleSend"
        @send-roll="handleRoll"
        @delete="handleDelete"
        @delete-all="handleDeleteAll"
        @claim="handleClaim"
        @grab="handleGrab"
        @claim-currency="handleClaimCurrency"
        @claim-to-npc="handleClaimToNpc"
        @claim-loot-chest="handleClaimLootChest"
        @pay-vendor-offer="handlePayVendorOffer"
        @send-vendor-offer="handleSendVendorOffer"
        @buy-player-offer="handleBuyPlayerOffer"
        @load-older="loadOlder"
        @close="ui.chatOpen = false"
      />
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted } from "vue";
import { IconMessage } from '@/lib/icons';
import { railTransition } from "@/lib/motion";
import { loadReadMarker, resolveChatUnread, saveReadMarker, type ReadMarker } from "@/components/chat/chatUnread";
import { useCampaignStore } from "@/stores/campaign";
import { useUiStore } from "@/stores/ui";
import { useCampaignMessages, loadChatHistory } from "@/composables/campaign/useCampaignMessages";
import { useCampaignMembers } from "@/composables/campaign/useCampaignMembers";
import { useAuthStore } from "@/stores/auth";
import { useToast } from "@/composables/useToast";
import { postgrestMessage, useChatSendFailure } from "@/composables/campaign/chatSendErrors";
import { useQueryClient } from "@tanstack/vue-query";
import { useAddInventoryItem } from "@/composables/items/usePartyInventory";
import { resolveItemById, useItemsByIds } from "@/composables/items/useItemsByIds";
import { useParty, useUpdatePartyMember } from "@/composables/party/useParty";
import { useNpcs } from "@/composables/npcs/useNpcs";
import { getNpcDisplayName } from "@/lib/npcDisplay";
import ChatPanelContent from "./ChatPanelContent.vue";
import type { RollResult } from "@/lib/dice/dice";
import type { ItemDropMetadata, CurrencyDropMetadata, VendorOfferMetadata, PlayerOfferMetadata, LootChestMetadata } from "@/types/chat.types";
import { toCP, fromCP } from "@/rules/currency";
import { itemRefColumns } from "@/lib/itemRef";
import type { Item } from "@/types/item.types";

const { contained = false, hideTab = false } = defineProps<{ contained?: boolean; hideTab?: boolean }>();

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
  const wasTap = delta < 6;
  localStorage.setItem(CHAT_TAB_TOP_KEY, String(tabTop.value));
  dragState.value = null;
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", onPointerUp);
  if (wasTap) {
    // Touch browsers fire a synthetic `click` event after pointerup. Because
    // the tab is draggable, the tab button itself doesn't handle the click —
    // the click fires at the touch-release coordinates, which is exactly
    // where the newly-rendered mobile backdrop lives (same Y as the tab). The
    // backdrop's @click would immediately close the chat we just opened, so
    // we swallow the next click once.
    window.addEventListener(
      "click",
      (ce) => { ce.stopImmediatePropagation(); ce.preventDefault(); },
      { once: true, capture: true },
    );
    ui.toggleChat();
  }
}

onUnmounted(() => {
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", onPointerUp);
});

const ui = useUiStore();
const auth = useAuthStore();
const campaign = useCampaignStore();
const { messages, unreadMessages, loading, loadingOlder, hasOlder, loadOlder, ensureMessage, sendMessage, sendRoll, claimItemDrop, grabItemDrop, claimCurrencyDrop, claimLootChestAtom, sendVendorOffer, claimVendorOffer, claimPlayerOffer, deleteMessage, deleteAllMessages, myUserId } =
  useCampaignMessages();
const toast = useToast();
const { reportChatFailure, reportMessageFailure } = useChatSendFailure();
// The chat widget is mounted on every DM page so it can raise the unread badge,
// but members / party / item catalogue / NPCs are only ever read by the panel's
// own UI and its claim handlers. Gate them on the panel actually being open —
// otherwise every page load pulled the full item catalogue (plus the SRD item
// table) and every NPC row for a panel the user never opened.
const chatOpen = () => ui.chatOpen;
const { data: members } = useCampaignMembers(chatOpen);
const { data: party }    = useParty(chatOpen);
// Both lookups below resolve an item a chat message already names, so they read exactly
// those items by id, with no source or edition filter (#961), and only while the panel is open.
const namedItemIds = computed(() =>
  messages.value.flatMap((m) => {
    if (m.type === "vendor_offer") return [(m.metadata as VendorOfferMetadata).item_id];
    if (m.type === "loot_chest") return ((m.metadata as LootChestMetadata).rolled_atoms ?? []).map((a) => a.item_id ?? null);
    return [];
  }),
);
const { data: namedItems } = useItemsByIds(namedItemIds, () => ({ enabled: ui.chatOpen }));
const { data: npcsData } = useNpcs(chatOpen);
const { mutateAsync: addInventoryItem }    = useAddInventoryItem();
const { mutateAsync: updatePartyMember }   = useUpdatePartyMember();
const queryClient = useQueryClient();

// The DM's "As:" persona list. `getNpcDisplayName`, not `n.name`: an NPC with
// an unrevealed alter ego speaks under its cover, and the raw name posted the
// true one as `sender_name` on every line the DM said in that persona — the
// loudest possible place for it, above the message, in everyone's chat.
//
// The field gate (`getNpcPlayerFacingName`) deliberately does *not* apply here.
// Choosing a persona is the DM attributing a line out loud; rewriting that to
// "???" would fight an explicit instruction. `is_revealed` is different — it is
// the DM's own flag saying this identity is still a secret.
const npcs = computed(() =>
  (npcsData.value ?? []).map((n) => ({ id: n.id, name: getNpcDisplayName(n) ?? "???" }))
);

// The persona name is stored as a snapshot when the DM picks it, so revealing
// (or re-concealing) that NPC mid-session would leave the old identity on every
// subsequent line. Re-sync it whenever the list changes; setDmTalkAsNpc no-ops
// when nothing moved.
watch(npcs, (list) => {
  if (!ui.dmTalkAsNpcId) return;
  const npc = list.find((n) => n.id === ui.dmTalkAsNpcId);
  // Only when the NPC is actually in the list. A miss means the query is
  // between fetches (or the NPC was deleted), and blanking the name there would
  // silently drop the DM's chosen persona back to their own name mid-sentence.
  if (npc) ui.setDmTalkAsNpc(npc.id, npc.name);
});

// The dot is a read position, not a transition (chatUnread.ts). `messages` is
// mutated in place (push + sort), so watch what the position depends on: the
// newest message, how many there are (a refetch can add older ones without
// changing the newest), whether the chat is on screen, and the campaign.
const chatViewing = computed(() => ui.chatOpen);
let markerKey: string | null = null;
let marker: ReadMarker | null = null;

function syncChatUnread() {
  const userId = auth.user?.id;
  const campaignId = campaign.activeCampaignId;
  if (!userId || !campaignId) {
    ui.chatHasUnread = false;
    return;
  }
  const key = `${userId}:${campaignId}`;
  if (key !== markerKey) {
    markerKey = key;
    marker = loadReadMarker(userId, campaignId);
  }
  const result = resolveChatUnread({
    // Right after a campaign switch the list can still hold the old campaign's
    // messages for a tick; reading them against the new campaign's marker would
    // adopt the wrong newest message.
    messages: unreadMessages.value.filter((m) => m.campaign_id === campaignId),
    marker,
    viewing: chatViewing.value,
    myUserId: userId,
  });
  ui.chatHasUnread = result.unread;
  if (result.marker && result.marker !== marker) {
    marker = result.marker;
    saveReadMarker(userId, campaignId, result.marker);
  }
}

watch(
  () => [unreadMessages.value.at(-1)?.id, unreadMessages.value.length, chatViewing.value, campaign.activeCampaignId, auth.user?.id],
  syncChatUnread,
  { immediate: true },
);

// The history is read when the chat first opens, not at boot (#999): until then
// the dot runs off a narrow probe of the newest rows (`unreadMessages`).
watch(chatViewing, (open) => { if (open) loadChatHistory(); }, { immediate: true });

watch(() => ui.chatFocusRequest, () => {
  if (ui.chatFocusMessageId) void ensureMessage(ui.chatFocusMessageId).catch(() => { /* chat keeps its current window */ });
});

function resolveClaimerName(): string {
  if (ui.dmTalkAsNpcName) return ui.dmTalkAsNpcName;
  if (auth.linkedPartyMemberId) {
    const character = (party.value ?? []).find(p => p.id === auth.linkedPartyMemberId);
    if (character?.name) return character.name;
  }
  return auth.publicName ?? 'Someone';
}

async function handleClaim({ messageId, intoStash }: { messageId: string; intoStash: boolean }) {
  const msg = messages.value.find(m => m.id === messageId);
  if (!msg || msg.type !== 'item_drop') return;
  const meta = msg.metadata as ItemDropMetadata;
  if (meta.claimed_by_user_id) return;

  const partyMemberId = intoStash ? null : (auth.linkedPartyMemberId ?? null);
  const claimerName = resolveClaimerName();

  // claim_item_drop now stamps the claim AND inserts the party_inventory row in
  // one transaction (identification/container flags derived from the drop meta),
  // so a tab close / network drop can no longer mark it claimed yet lose the item.
  try {
    await claimItemDrop(messageId, claimerName, partyMemberId);
  } catch {
    return; // already claimed by someone else or RLS denied — nothing delivered
  }
  void queryClient.invalidateQueries({ queryKey: ["party-inventory"] });
  void queryClient.invalidateQueries({ queryKey: ["items"] });
}

async function handleGrab({ messageId, qty, intoStash }: { messageId: string; qty: number; intoStash: boolean }) {
  const msg = messages.value.find(m => m.id === messageId);
  if (!msg || msg.type !== 'item_drop') return;

  const partyMemberId = intoStash ? null : (auth.linkedPartyMemberId ?? null);
  const claimerName = resolveClaimerName();

  // grab_item_drop now records the grab AND delivers the quantity — auto-stacking
  // onto an existing carried backpack/belt row, or inserting a new one — atomically,
  // so a tab close can't record the grab yet lose the item.
  try {
    await grabItemDrop(messageId, qty, claimerName, partyMemberId);
  } catch {
    return; // stack exhausted or RLS denied — nothing delivered
  }
  void queryClient.invalidateQueries({ queryKey: ["party-inventory"] });
  void queryClient.invalidateQueries({ queryKey: ["items"] });
}

async function handleClaimCurrency({ messageId }: { messageId: string }) {
  const msg = messages.value.find(m => m.id === messageId);
  if (!msg || msg.type !== 'currency_drop') return;
  const meta = msg.metadata as CurrencyDropMetadata;
  if (meta.claimed_by_user_id) return;

  const partyMemberId = auth.linkedPartyMemberId ?? null;
  const claimerName = resolveClaimerName();

  // claim_currency_drop now credits the claimer's purse atomically inside the
  // same transaction that stamps the claim (clamped to non-negative ints), so a
  // tab close / network drop can no longer mark it claimed yet lose the coins.
  try {
    await claimCurrencyDrop(messageId, claimerName, partyMemberId);
  } catch {
    return; // lost the race (already claimed) or RLS denied — nothing credited
  }
  void queryClient.invalidateQueries({ queryKey: ["party"] });
}

async function handleSendVendorOffer(payload: { description: string; itemName: string | null; itemId: string | null; pp: number; gp: number; ep: number; sp: number; cp: number }) {
  try {
    await sendVendorOffer(payload.description, payload.itemName, payload.itemId, payload.pp, payload.gp, payload.ep, payload.sp, payload.cp);
  } catch (e) {
    reportChatFailure(e, "post the offer to the chat");
  }
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

  // Read the item before any money moves: its flags decide whether it is a service or
  // arrives identified, and the reactive map can lag a refetch. A failed read aborts here.
  let vendorVaultItem: Item | undefined;
  try {
    vendorVaultItem = meta.item_id ? await resolveItemById(queryClient, namedItems.value, meta.item_id) : undefined;
  } catch (e) {
    reportChatFailure(e, "pay for that");
    return;
  }

  const payerName = resolveClaimerName();
  try {
    await claimVendorOffer(messageId, payerName, partyMemberId);
  } catch {
    return; // lost the race (already paid) or RLS denied — don't deduct wallet
  }

  const { pp, gp, ep, sp, cp } = fromCP(walletCP - costCP);
  const isService = vendorVaultItem?.item_type === "service";
  await Promise.all([
    updatePartyMember({ id: member.id, update: { pp, gp, ep, sp, cp } }),
    meta.item_name && !isService ? addInventoryItem({
      name: meta.item_name, quantity: 1, ...itemRefColumns(meta.item_id),
      carried_by: partyMemberId,
      location: 'backpack', slot: null,
      is_container: false, container_id: null,
      is_attuned: false, is_equipped: false, notes: null, is_ruined: false,
      is_identified: !vendorVaultItem || vendorVaultItem.rarity === 'mundane',
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

  try {
    // One atomic RPC does the whole exchange server-side: credit the seller
    // (which RLS blocks a fellow player from doing directly), debit the buyer,
    // and transfer the item. A throw means the sale did not happen (lost race,
    // insufficient funds, or not authorized) — nothing was charged.
    await claimPlayerOffer(messageId, buyerName, buyerPartyMemberId);
  } catch {
    return;
  }

  // Money + item moved server-side; refresh the buyer's own caches. The seller's
  // client refetches its party on the party_members ring.
  void queryClient.invalidateQueries({ queryKey: ["party"] });
  void queryClient.invalidateQueries({ queryKey: ["party-inventory"] });
}

async function handleSend({
  text,
  recipientUserId,
}: {
  text: string;
  recipientUserId: string | null;
}): Promise<boolean> {
  try {
    await sendMessage(text, recipientUserId);
    return true;
  } catch (e) {
    reportMessageFailure(e, recipientUserId !== null);
    return false;
  }
}
async function handleRoll({
  result,
  recipientUserId,
}: {
  result: RollResult;
  recipientUserId: string | null;
}) {
  try {
    await sendRoll(result, recipientUserId);
  } catch (e) {
    reportMessageFailure(e, recipientUserId !== null);
  }
}

async function handleClaimLootChest({ messageId, atomId }: { messageId: string; atomId: string }) {
  // The RPC handles all of: row lock, member check, empty check, "already
  // claimed" check, and atomic claim append. We just need to surface a name
  // for the chest log + add the claimed item to the player's inventory.
  const msg = messages.value.find(m => m.id === messageId);
  if (!msg || msg.type !== 'loot_chest') return;
  const meta = msg.metadata as LootChestMetadata;
  const atom = meta.rolled_atoms?.find(a => a.atom_id === atomId);
  if (!atom) return;

  const partyMemberId = auth.linkedPartyMemberId ?? null;
  // Both item and currency rewards need a linked character to receive them (the
  // item goes to inventory, the coins to the character's wallet). Guard BEFORE the
  // claim RPC so an undeliverable claim never stamps the atom and destroys the
  // reward for everyone.
  if (!partyMemberId) return;
  const claimerName =
    (members.value ?? []).find(m => m.user_id === auth.user?.id)?.display_name
    || (party.value ?? []).find(p => p.id === partyMemberId)?.name
    || "Someone";

  // Read the item before the claim stamps the atom: the container flag comes from its
  // tags, and the reactive map can lag a refetch. A failed read leaves the atom unclaimed.
  let vaultItem: Item | undefined;
  if (atom.type !== 'currency' && atom.item_id) {
    try {
      vaultItem = await resolveItemById(queryClient, namedItems.value, atom.item_id);
    } catch (e) {
      reportChatFailure(e, "claim that from the chest");
      return;
    }
  }

  try {
    await claimLootChestAtom(messageId, atomId, claimerName);
  } catch (e) {
    // Losing the race is normal: another player's click took the lock first
    // (claim_loot_chest_atom raises these two), and the chest re-renders from
    // realtime. Anything else is a real failure.
    const message = postgrestMessage(e);
    const lostRace = message === "Item already claimed" || message === "Chest is empty";
    if (lostRace) toast.info("Someone else claimed that first.");
    else reportChatFailure(e, "claim that from the chest");
    return;
  }

  // Currency atoms pay the character's wallet; only item atoms become inventory rows.
  if (atom.type === 'currency') {
    const member = (party.value ?? []).find(p => p.id === partyMemberId);
    if (!member) return;
    await updatePartyMember({
      id: member.id,
      update: {
        pp: member.pp + (atom.pp ?? 0),
        gp: member.gp + (atom.gp ?? 0),
        ep: member.ep + (atom.ep ?? 0),
        sp: member.sp + (atom.sp ?? 0),
        cp: member.cp + (atom.cp ?? 0),
      },
    });
    return;
  }

  // Item atom → inventory. Mirrors the item_drop claim path (Vault ref optional,
  // container flag from tags, identified state inferred from rarity).
  {
    // Flags come from the rolled atom (captured from the source item), not the
    // claimer's vault cache — same identification/container leak as item_drop.
    await addInventoryItem({
      name: atom.item_name ?? "",
      quantity: 1,
      ...itemRefColumns(atom.item_id ?? null),
      carried_by: partyMemberId,
      location: 'backpack',
      slot: null,
      is_container: atom.item_is_container ?? (vaultItem?.tags.includes("container") ?? false),
      container_id: null,
      is_attuned: false,
      is_equipped: false,
      notes: null,
      is_ruined: false,
      is_identified: atom.item_rarity === 'mundane',
    });
  }
}

async function handleClaimToNpc({ messageId, npcId, npcName }: { messageId: string; npcId: string; npcName: string }) {
  const msg = messages.value.find(m => m.id === messageId);
  if (!msg || msg.type !== 'item_drop') return;
  const meta = msg.metadata as ItemDropMetadata;
  if (meta.claimed_by_user_id) return;

  // With a p_npc_id, claim_item_drop inserts the npc_inventory row itself (atomic
  // with the claim stamp), so no post-hoc write is needed.
  try {
    await claimItemDrop(messageId, npcName, null, npcId);
  } catch {
    return;
  }
  void queryClient.invalidateQueries({ queryKey: ["npc-inventory"] });
}

async function handleDeleteAll() {
  if (!confirm("Delete all messages in this chat? This cannot be undone.")) return;
  try {
    await deleteAllMessages();
  } catch (e) {
    reportChatFailure(e, "delete the messages");
  }
}

async function handleDelete(id: string) {
  try {
    await deleteMessage(id);
  } catch (e) {
    reportChatFailure(e, "delete the message");
  }
}
</script>

<style scoped>
.tab-fade-enter-active,
.tab-fade-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}
.tab-fade-enter-from,
.tab-fade-leave-to {
  opacity: 0;
  transform: translateX(0.5rem);
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
