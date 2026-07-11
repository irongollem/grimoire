import { ref, computed, watch } from "vue";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
import { useParty } from "@/composables/useParty";
import { useCampaignMembers } from "@/composables/useCampaignMembers";
import type { CampaignMessage, CampaignMessageInsert, ItemDropMetadata, CurrencyDropMetadata, VendorOfferMetadata, PlayerOfferMetadata, FlavorMetadata, LootChestMetadata } from "@/types/chat.types";
import { formatCoinParts } from "@/lib/currency";
import type { RollResult } from "@/lib/dice";

const LIMIT = 100;

// ── Module-level singleton ─────────────────────────────────────────────────────
// All components that call useCampaignMessages() share the same messages array
// and the same realtime subscription — so sendRoll() from PlayerCharacterView
// immediately appears in CampaignChat without a refresh.

const messages = ref<CampaignMessage[]>([]);
const loading  = ref(false);
let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;
let subscribedCampaignId: string | null = null;
let generation = 0; // incremented each subscribe(); callbacks ignore stale gens
let reconnectAttempts = 0;
const MAX_RECONNECT = 5;

async function fetchMessages(campaignId: string) {
  loading.value = true;
  // Safety net: if navigator.locks contention (e.g. iOS resume + auth refresh)
  // causes getSession() to hang, clear the spinner after 8s instead of forever.
  const bail = setTimeout(() => { loading.value = false; }, 8_000);
  try {
    const { data, error } = await supabase
      .from("campaign_messages")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: true })
      .limit(LIMIT);
    if (!error) {
      const auth = useAuthStore();
      const uid = auth.user?.id;
      messages.value = ((data ?? []) as CampaignMessage[]).filter(msg => {
        // dm_roll: only the recipient (DM) sees it — sender never sees result
        if (msg.type === "dm_roll") return auth.isDM || msg.recipient_user_id === uid;
        // public or addressed to me or DM or I sent it (regular whisper)
        return msg.recipient_user_id === null || auth.isDM || msg.recipient_user_id === uid || msg.user_id === uid;
      });
    }
  } catch {
    // AbortError (auth lock steal) or network error — just leave current messages
  } finally {
    clearTimeout(bail);
    loading.value = false;
  }
}

function subscribe(campaignId: string) {
  if (realtimeChannel) supabase.removeChannel(realtimeChannel);
  subscribedCampaignId = campaignId;
  const myGen = ++generation;
  realtimeChannel = supabase
    .channel(`campaign-messages:${campaignId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "campaign_messages", filter: `campaign_id=eq.${campaignId}` },
      (payload) => {
        const auth = useAuthStore();
        const msg = payload.new as CampaignMessage;
        // Replace optimistic entry with the confirmed DB version (which has full JSONB)
        const existingIdx = messages.value.findIndex(m => m.id === msg.id);
        if (existingIdx >= 0) {
          messages.value[existingIdx] = msg;
          return;
        }
        const uid = auth.user?.id;
        const visible = msg.type === "dm_roll"
          ? auth.isDM || msg.recipient_user_id === uid
          : msg.recipient_user_id === null || auth.isDM || msg.recipient_user_id === uid || msg.user_id === uid;
        if (visible) {
          messages.value.push(msg);
          if (messages.value.length > LIMIT) messages.value.shift();
        }
      },
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "campaign_messages", filter: `campaign_id=eq.${campaignId}` },
      (payload) => {
        const updated = payload.new as CampaignMessage;
        const idx = messages.value.findIndex(m => m.id === updated.id);
        if (idx >= 0) messages.value[idx] = updated;
      },
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "campaign_messages", filter: `campaign_id=eq.${campaignId}` },
      (payload) => {
        const deletedId = (payload.old as { id: string }).id;
        messages.value = messages.value.filter(m => m.id !== deletedId);
      },
    )
    .subscribe((status, _err) => {
      // CLOSED fires whenever we call removeChannel() ourselves — ignore it.
      // Only reconnect on genuine transport errors for the current generation.
      if (myGen !== generation) return;
      if (status === "SUBSCRIBED") {
        reconnectAttempts = 0;
        return;
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        if (reconnectAttempts >= MAX_RECONNECT) {
          return;
        }
        reconnectAttempts++;
        // Exponential backoff: 2s, 4s, 8s … capped at 30s
        const delay = Math.min(2000 * Math.pow(2, reconnectAttempts - 1), 30_000);
        setTimeout(async () => {
          if (!subscribedCampaignId || myGen !== generation) return;
          await fetchMessages(subscribedCampaignId);
          if (subscribedCampaignId && myGen === generation) subscribe(subscribedCampaignId);
        }, delay);
      }
    });
}

// Boot the subscription once when the campaign changes (shared watcher)
let watcherStarted = false;
function ensureWatcher() {
  if (watcherStarted) return;
  watcherStarted = true;
  const campaign = useCampaignStore();
  watch(
    () => campaign.activeCampaignId,
    async (id) => {
      messages.value = [];
      subscribedCampaignId = null;
      reconnectAttempts = 0;
      if (id) { await fetchMessages(id); subscribe(id); }
    },
    { immediate: true },
  );

  // When the tab becomes visible again after sleeping/backgrounding:
  // - If the channel gave up (max attempts reached), reset and fully reconnect.
  // - Otherwise just backfill missed messages.
  // singleTabLock (in supabase.ts) queues auth and DB operations without a
  // timeout, so no explicit session wait is needed here — fetchMessages() will
  // naturally run after autoRefreshToken finishes if the token needed renewal.
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", async () => {
      if (document.visibilityState !== "visible" || !subscribedCampaignId) return;
      const auth = useAuthStore();
      if (!auth.isAuthenticated) return;
      const cid = subscribedCampaignId;
      if (!cid) return;
      if (reconnectAttempts >= MAX_RECONNECT) {
        reconnectAttempts = 0;
        await fetchMessages(cid);
        if (subscribedCampaignId) subscribe(subscribedCampaignId);
      } else {
        await fetchMessages(cid);
      }
    });
  }
}

// ── Public composable ──────────────────────────────────────────────────────────
export function useCampaignMessages() {
  ensureWatcher();

  const campaign = useCampaignStore();
  const auth = useAuthStore();
  const ui = useUiStore();
  const { data: partyMembers } = useParty();
  const { data: campaignMembers } = useCampaignMembers();

  // Name resolution priority: NPC persona → previewed character → linked character → display name
  function getSenderName() {
    if (ui.dmTalkAsNpcName) return ui.dmTalkAsNpcName;
    const memberId = ui.dmPreviewMode
      ? ui.dmPreviewPartyMemberId
      : auth.linkedPartyMemberId;
    if (memberId && partyMembers.value) {
      const character = partyMembers.value.find(m => m.id === memberId);
      if (character?.name) return character.name;
    }
    return auth.membership?.display_name ?? auth.userEmail ?? "Unknown";
  }

  // In preview mode the DM sees only what the previewed player would see:
  // public messages + whispers addressed to that player's user_id.
  const previewedUserId = computed(() => {
    if (!ui.dmPreviewMode || !ui.dmPreviewPartyMemberId) return null;
    return campaignMembers.value?.find(
      m => m.party_member_id === ui.dmPreviewPartyMemberId,
    )?.user_id ?? null;
  });

  const visibleMessages = computed(() => {
    if (!ui.dmPreviewMode) return messages.value;
    const pid = previewedUserId.value;
    return messages.value.filter(
      m => m.recipient_user_id === null || m.recipient_user_id === pid,
    );
  });

  async function sendFlavorMessage(text: string, skillLabel?: string) {
    const cid = campaign.activeCampaignId;
    if (!cid || !auth.user?.id) return;
    const metadata: FlavorMetadata | null = skillLabel ? { skill_label: skillLabel } : null;
    const insert: CampaignMessageInsert = {
      campaign_id: cid,
      user_id: auth.user.id,
      recipient_user_id: null,
      sender_name: getSenderName(),
      message: text,
      type: "system",
      metadata,
    };
    const { data } = await supabase.from("campaign_messages").insert(insert).select().single();
    if (data) _optimisticPush(data as CampaignMessage);
  }

  async function sendMessage(text: string, recipientUserId: string | null = null) {
    const cid = campaign.activeCampaignId;
    if (!cid || !auth.user?.id || !text.trim()) return;
    const insert: CampaignMessageInsert = {
      campaign_id: cid,
      user_id: auth.user.id,
      recipient_user_id: recipientUserId,
      sender_name: getSenderName(),
      message: text.trim(),
      type: "chat",
      metadata: null,
    };
    const { data } = await supabase.from("campaign_messages").insert(insert).select().single();
    if (data) _optimisticPush(data as CampaignMessage);
  }

  /**
   * Narrative system event — used by the DM Prep/Play mode (#133) to announce
   * entity reveals into chat. Posts as a `system` message with no sender name
   * so it renders as a campaign event rather than a person talking.
   * Pass `npcId` to attach an entity link so players can navigate to the NPC.
   */
  async function sendNarrativeEvent(text: string, npcId?: string) {
    const cid = campaign.activeCampaignId;
    if (!cid || !auth.user?.id || !text.trim()) return;
    const insert: CampaignMessageInsert = {
      campaign_id: cid,
      user_id: auth.user.id,
      recipient_user_id: null,
      sender_name: null,
      message: text.trim(),
      type: "system",
      metadata: npcId ? { entity_type: "npc", entity_id: npcId } : null,
    };
    const { data } = await supabase.from("campaign_messages").insert(insert).select().single();
    if (data) _optimisticPush(data as CampaignMessage);
  }

  async function sendRoll(result: RollResult, recipientUserId: string | null = null, senderName?: string) {
    const cid = campaign.activeCampaignId;
    if (!cid || !auth.user?.id) return;
    // Crits are always public — too exciting to hide
    const effectiveRecipient = result.isCrit ? null : recipientUserId;
    const insert: CampaignMessageInsert = {
      campaign_id: cid,
      user_id: auth.user.id,
      recipient_user_id: effectiveRecipient,
      sender_name: senderName ?? getSenderName(),
      message: `rolled ${result.label} = ${result.total}`,
      type: effectiveRecipient ? "dm_roll" : "roll",
      metadata: result,
    };
    const { data } = await supabase.from("campaign_messages").insert(insert).select().single();
    if (data) _optimisticPush(data as CampaignMessage);
  }

  async function sendItemDrop(itemName: string, itemId: string | null, quantity: number, rarity: string | null, senderName?: string, imageUrl?: string | null, description?: string | null) {
    const cid = campaign.activeCampaignId;
    if (!cid || !auth.user?.id) return;
    const metadata: ItemDropMetadata = {
      item_id: itemId, item_name: itemName, item_rarity: rarity, quantity,
      quantity_remaining: quantity,
      claims: [],
      image_url: imageUrl ?? null,
      description: description ?? null,
      claimed_by_user_id: null, claimed_by_name: null, claimed_party_member_id: null,
    };
    const insert: CampaignMessageInsert = {
      campaign_id: cid,
      user_id: auth.user.id,
      recipient_user_id: null,
      sender_name: senderName ?? getSenderName(),
      message: `dropped ${quantity > 1 ? `${quantity}x ` : ""}${itemName}`,
      type: "item_drop",
      metadata,
    };
    const { data } = await supabase.from("campaign_messages").insert(insert).select().single();
    if (data) _optimisticPush(data as CampaignMessage);
  }

  async function sendCurrencyDrop(pp: number, gp: number, ep: number, sp: number, cp: number, label?: string) {
    const cid = campaign.activeCampaignId;
    if (!cid || !auth.user?.id) return;
    const parts = formatCoinParts(pp, gp, ep, sp, cp);
    if (!parts.length) return;
    const metadata: CurrencyDropMetadata = {
      label: label || null,
      pp, gp, ep, sp, cp,
      claimed_by_user_id: null, claimed_by_name: null, claimed_party_member_id: null,
    };
    const insert: CampaignMessageInsert = {
      campaign_id: cid,
      user_id: auth.user.id,
      recipient_user_id: null,
      sender_name: getSenderName(),
      message: label ? `dropped ${label}: ${parts.join(", ")}` : `dropped currency: ${parts.join(", ")}`,
      type: "currency_drop",
      metadata,
    };
    const { data } = await supabase.from("campaign_messages").insert(insert).select().single();
    if (data) _optimisticPush(data as CampaignMessage);
  }

  async function sendVendorOffer(description: string, itemName: string | null, itemId: string | null, pp: number, gp: number, ep: number, sp: number, cp: number, senderName?: string) {
    const cid = campaign.activeCampaignId;
    if (!cid || !auth.user?.id) return;
    const parts = formatCoinParts(pp, gp, ep, sp, cp);
    const metadata: VendorOfferMetadata = {
      description, item_name: itemName, item_id: itemId,
      pp, gp, ep, sp, cp,
      paid_by_user_id: null, paid_by_name: null, paid_party_member_id: null,
    };
    const insert: CampaignMessageInsert = {
      campaign_id: cid,
      user_id: auth.user.id,
      recipient_user_id: null,
      sender_name: senderName ?? getSenderName(),
      message: `offers ${description}${parts.length ? ` for ${parts.join(", ")}` : ""}`,
      type: "vendor_offer",
      metadata,
    };
    const { data } = await supabase.from("campaign_messages").insert(insert).select().single();
    if (data) _optimisticPush(data as CampaignMessage);
  }

  // Claims delegate to row-locked SECURITY DEFINER RPCs (claim_vendor_offer /
  // claim_currency_drop / claim_item_drop) which re-check the claimed flag under
  // FOR UPDATE and stamp the claimer from auth.uid() server-side — so concurrent
  // claims serialise and a player cannot overwrite another player's claim. The
  // RPC raises if already claimed; callers treat a throw as "lost the race".
  async function claimVendorOffer(messageId: string, payerName: string, partyMemberId: string | null) {
    const { data, error } = await supabase.rpc("claim_vendor_offer", {
      p_message_id: messageId,
      p_payer_name: payerName,
      p_party_member_id: partyMemberId,
    });
    if (error) throw error;
    const idx = messages.value.findIndex(m => m.id === messageId);
    if (idx >= 0 && data) messages.value[idx] = { ...messages.value[idx], metadata: data as VendorOfferMetadata };
  }

  async function claimCurrencyDrop(messageId: string, claimerName: string, partyMemberId: string | null) {
    const { data, error } = await supabase.rpc("claim_currency_drop", {
      p_message_id: messageId,
      p_claimer_name: claimerName,
      p_party_member_id: partyMemberId,
    });
    if (error) throw error;
    const idx = messages.value.findIndex(m => m.id === messageId);
    if (idx >= 0 && data) messages.value[idx] = { ...messages.value[idx], metadata: data as CurrencyDropMetadata };
  }

  async function claimItemDrop(messageId: string, claimerName: string, partyMemberId: string | null, npcId?: string | null) {
    const { data, error } = await supabase.rpc("claim_item_drop", {
      p_message_id: messageId,
      p_claimer_name: claimerName,
      p_party_member_id: partyMemberId,
      p_npc_id: npcId ?? null,
    });
    if (error) throw error;
    const idx = messages.value.findIndex(m => m.id === messageId);
    if (idx >= 0 && data) messages.value[idx] = { ...messages.value[idx], metadata: data as ItemDropMetadata };
  }

  // ── Stacked item grab (issue #126) ───────────────────────────────────────
  // Delegates to the grab_item_drop RPC which takes a FOR UPDATE row lock so
  // concurrent player clicks serialise without over-claiming.
  // qty = -1 means "grab all remaining".
  // Returns { qty_grabbed, quantity_remaining } on success, throws on failure.
  async function grabItemDrop(messageId: string, qty: number, claimerName: string, partyMemberId: string | null): Promise<{ qty_grabbed: number; quantity_remaining: number }> {
    const { data, error } = await supabase.rpc("grab_item_drop", {
      p_message_id:      messageId,
      p_qty:             qty,
      p_claimer_user_id: auth.user!.id,
      p_claimer_name:    claimerName,
      p_party_member_id: partyMemberId,
    });
    if (error) throw error;
    const result = data as { qty_grabbed: number; quantity_remaining: number };
    // Optimistically patch local message so the UI updates immediately
    const idx = messages.value.findIndex(m => m.id === messageId);
    if (idx >= 0) {
      const existing = messages.value[idx].metadata as ItemDropMetadata;
      const updatedClaims = [
        ...(existing.claims ?? []),
        { user_id: auth.user!.id, name: claimerName, party_member_id: partyMemberId, qty: result.qty_grabbed, at: new Date().toISOString() },
      ];
      messages.value[idx] = {
        ...messages.value[idx],
        metadata: { ...existing, quantity_remaining: result.quantity_remaining, claims: updatedClaims },
      };
    }
    return result;
  }

  // ── Loot chest (issue #121, part B) ──────────────────────────────────────
  // sendLootChest just inserts the message — the table is already rolled
  // client-side and handed in via `metadata`. claimLootChestAtom delegates
  // to a Postgres RPC so concurrent clicks serialise on a row lock.

  async function sendLootChest(metadata: LootChestMetadata, senderName?: string) {
    const cid = campaign.activeCampaignId;
    if (!cid || !auth.user?.id) return;
    const insert: CampaignMessageInsert = {
      campaign_id: cid,
      user_id: auth.user.id,
      recipient_user_id: null,
      sender_name: senderName ?? getSenderName(),
      message: `dropped a chest from ${metadata.loot_table_name}`,
      type: "loot_chest",
      metadata,
    };
    const { data } = await supabase.from("campaign_messages").insert(insert).select().single();
    if (data) _optimisticPush(data as CampaignMessage);
  }

  async function claimLootChestAtom(messageId: string, atomId: string, claimerName: string) {
    const { data, error } = await supabase.rpc("claim_loot_chest_atom", {
      p_message_id: messageId,
      p_atom_id: atomId,
      p_claimer_name: claimerName,
    });
    if (error) throw error;
    // RPC returns the new metadata blob — patch local state so the chest
    // updates without waiting for the realtime subscription.
    const idx = messages.value.findIndex(m => m.id === messageId);
    if (idx >= 0 && data) {
      messages.value[idx] = { ...messages.value[idx], metadata: data as LootChestMetadata };
    }
  }

  async function deleteMessage(id: string) {
    await supabase.from("campaign_messages").delete().eq("id", id);
    messages.value = messages.value.filter(m => m.id !== id);
  }

  async function deleteAllMessages() {
    const cid = campaign.activeCampaignId;
    if (!cid) return;
    await supabase.from("campaign_messages").delete().eq("campaign_id", cid);
    messages.value = [];
  }

  function _optimisticPush(msg: CampaignMessage) {
    if (messages.value.find(m => m.id === msg.id)) return;
    const uid = auth.user?.id;
    const visible = msg.type === "dm_roll"
      ? auth.isDM || msg.recipient_user_id === uid
      : msg.recipient_user_id === null || auth.isDM || msg.recipient_user_id === uid || msg.user_id === uid;
    if (!visible) return;
    messages.value.push(msg);
    if (messages.value.length > LIMIT) messages.value.shift();
  }

  const myUserId = computed(() => auth.user?.id);

  async function sendPlayerOffer(itemName: string, itemId: string | null, inventoryItemId: string, quantity: number, sellerPartyMemberId: string, pp: number, gp: number, ep: number, sp: number, cp: number) {
    const cid = campaign.activeCampaignId;
    if (!cid || !auth.user?.id) return;
    const parts = formatCoinParts(pp, gp, ep, sp, cp);
    const metadata: PlayerOfferMetadata = {
      item_name: itemName, item_id: itemId, inventory_item_id: inventoryItemId,
      quantity, pp, gp, ep, sp, cp,
      seller_party_member_id: sellerPartyMemberId,
      sold_to_user_id: null, sold_to_name: null, sold_to_party_member_id: null,
    };
    const insert: CampaignMessageInsert = {
      campaign_id: cid,
      user_id: auth.user.id,
      recipient_user_id: null,
      sender_name: getSenderName(),
      message: `offers ${quantity > 1 ? `${quantity}× ` : ""}${itemName} for ${parts.join(", ")}`,
      type: "player_offer",
      metadata,
    };
    const { data } = await supabase.from("campaign_messages").insert(insert).select().single();
    if (data) _optimisticPush(data as CampaignMessage);
  }

  // Delegates to the row-locked SECURITY DEFINER claim_player_offer RPC, which
  // under FOR UPDATE authorizes the caller, validates the offer is unclaimed,
  // checks buyer funds (rejecting if insufficient), debits the buyer, credits the
  // seller (a fellow player's direct UPDATE of the seller's row is blocked by RLS,
  // so this MUST run server-side), and transfers the item — all atomically. The
  // RPC raises on a lost race / insufficient funds / not-authorized; callers treat
  // a throw as "the sale did not happen" and leave wallets/inventory untouched.
  async function claimPlayerOffer(messageId: string, buyerName: string, buyerPartyMemberId: string | null) {
    const { data, error } = await supabase.rpc("claim_player_offer", {
      p_message_id: messageId,
      p_buyer_name: buyerName,
      p_party_member_id: buyerPartyMemberId,
    });
    if (error) throw error;
    const idx = messages.value.findIndex(m => m.id === messageId);
    if (idx >= 0 && data) messages.value[idx] = { ...messages.value[idx], metadata: data as PlayerOfferMetadata };
  }

  return { messages: visibleMessages, loading, sendMessage, sendFlavorMessage, sendNarrativeEvent, sendRoll, sendItemDrop, claimItemDrop, grabItemDrop, sendCurrencyDrop, claimCurrencyDrop, sendLootChest, claimLootChestAtom, sendVendorOffer, claimVendorOffer, sendPlayerOffer, claimPlayerOffer, deleteMessage, deleteAllMessages, myUserId };
}
