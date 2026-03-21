import { ref, computed, watch } from "vue";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { useAuthStore } from "@/stores/auth";
import { useParty } from "@/composables/useParty";
import type { CampaignMessage, CampaignMessageInsert, ItemDropMetadata, CurrencyDropMetadata } from "@/types/chat.types";
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
  try {
    const { data, error } = await supabase
      .from("campaign_messages")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: true })
      .limit(LIMIT);
    if (!error) messages.value = (data ?? []) as CampaignMessage[];
  } catch {
    // AbortError (auth lock steal) or network error — just leave current messages
  } finally {
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
        // Skip messages already optimistically added
        if (messages.value.find(m => m.id === msg.id)) return;
        if (
          msg.recipient_user_id === null ||
          msg.user_id === auth.user?.id ||
          msg.recipient_user_id === auth.user?.id
        ) {
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
    .subscribe((status, err) => {
      // CLOSED fires whenever we call removeChannel() ourselves — ignore it.
      // Only reconnect on genuine transport errors for the current generation.
      if (myGen !== generation) return;
      if (status === "SUBSCRIBED") {
        reconnectAttempts = 0;
        return;
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        if (reconnectAttempts >= MAX_RECONNECT) {
          console.warn("[chat] max reconnect attempts reached, giving up until next navigation");
          return;
        }
        reconnectAttempts++;
        // Exponential backoff: 2s, 4s, 8s … capped at 30s
        const delay = Math.min(2000 * Math.pow(2, reconnectAttempts - 1), 30_000);
        console.warn(`[chat] channel error, reconnecting in ${delay}ms (attempt ${reconnectAttempts})…`, status, err);
        setTimeout(() => {
          if (subscribedCampaignId && myGen === generation) {
            fetchMessages(subscribedCampaignId).then(() => {
              if (subscribedCampaignId && myGen === generation) subscribe(subscribedCampaignId);
            });
          }
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
  // - Otherwise just backfill missed messages. Always delay slightly so Supabase's
  //   auth token refresh (which holds navigator.locks) finishes before we hit the DB.
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && subscribedCampaignId) {
        setTimeout(() => {
          if (!subscribedCampaignId) return;
          if (reconnectAttempts >= MAX_RECONNECT) {
            // Channel is dead — reset counter and resubscribe from scratch.
            console.info("[chat] woke up after giving up, resubscribing…");
            reconnectAttempts = 0;
            fetchMessages(subscribedCampaignId).then(() => {
              if (subscribedCampaignId) subscribe(subscribedCampaignId);
            });
          } else {
            fetchMessages(subscribedCampaignId);
          }
        }, 800);
      }
    });
  }
}

// ── Public composable ──────────────────────────────────────────────────────────
export function useCampaignMessages() {
  ensureWatcher();

  const campaign = useCampaignStore();
  const auth = useAuthStore();
  const { data: partyMembers } = useParty();

  // Prefer character name when the user has a linked party member
  function getSenderName() {
    if (auth.linkedPartyMemberId && partyMembers.value) {
      const character = partyMembers.value.find(m => m.id === auth.linkedPartyMemberId);
      if (character?.name) return character.name;
    }
    return auth.membership?.display_name ?? auth.userEmail ?? "Unknown";
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

  async function sendRoll(result: RollResult, recipientUserId: string | null = null) {
    const cid = campaign.activeCampaignId;
    if (!cid || !auth.user?.id) return;
    const insert: CampaignMessageInsert = {
      campaign_id: cid,
      user_id: auth.user.id,
      recipient_user_id: recipientUserId,
      sender_name: getSenderName(),
      message: `rolled ${result.label} = ${result.total}`,
      type: "roll",
      metadata: result,
    };
    const { data } = await supabase.from("campaign_messages").insert(insert).select().single();
    if (data) _optimisticPush(data as CampaignMessage);
  }

  async function sendItemDrop(itemName: string, itemId: string | null, quantity: number, rarity: string | null) {
    const cid = campaign.activeCampaignId;
    if (!cid || !auth.user?.id) return;
    const metadata: ItemDropMetadata = {
      item_id: itemId, item_name: itemName, item_rarity: rarity, quantity,
      claimed_by_user_id: null, claimed_by_name: null, claimed_party_member_id: null,
    };
    const insert: CampaignMessageInsert = {
      campaign_id: cid,
      user_id: auth.user.id,
      recipient_user_id: null,
      sender_name: getSenderName(),
      message: `dropped ${quantity > 1 ? `${quantity}x ` : ""}${itemName}`,
      type: "item_drop",
      metadata,
    };
    const { data } = await supabase.from("campaign_messages").insert(insert).select().single();
    if (data) _optimisticPush(data as CampaignMessage);
  }

  async function sendCurrencyDrop(pp: number, gp: number, ep: number, sp: number, cp: number) {
    const cid = campaign.activeCampaignId;
    if (!cid || !auth.user?.id) return;
    const parts: string[] = [];
    if (pp) parts.push(`${pp} PP`);
    if (gp) parts.push(`${gp} GP`);
    if (ep) parts.push(`${ep} EP`);
    if (sp) parts.push(`${sp} SP`);
    if (cp) parts.push(`${cp} CP`);
    if (!parts.length) return;
    const metadata: CurrencyDropMetadata = {
      pp, gp, ep, sp, cp,
      claimed_by_user_id: null, claimed_by_name: null, claimed_party_member_id: null,
    };
    const insert: CampaignMessageInsert = {
      campaign_id: cid,
      user_id: auth.user.id,
      recipient_user_id: null,
      sender_name: getSenderName(),
      message: `dropped currency: ${parts.join(", ")}`,
      type: "currency_drop",
      metadata,
    };
    const { data } = await supabase.from("campaign_messages").insert(insert).select().single();
    if (data) _optimisticPush(data as CampaignMessage);
  }

  async function claimCurrencyDrop(messageId: string, claimerName: string, partyMemberId: string | null) {
    const msg = messages.value.find(m => m.id === messageId);
    if (!msg || msg.type !== 'currency_drop') return;
    const existing = msg.metadata as CurrencyDropMetadata;
    if (existing.claimed_by_user_id) return;
    const newMeta: CurrencyDropMetadata = {
      ...existing,
      claimed_by_user_id: auth.user!.id,
      claimed_by_name: claimerName,
      claimed_party_member_id: partyMemberId,
    };
    const { error } = await supabase.from("campaign_messages").update({ metadata: newMeta }).eq("id", messageId);
    if (error) throw error;
    const idx = messages.value.findIndex(m => m.id === messageId);
    if (idx >= 0) messages.value[idx] = { ...messages.value[idx], metadata: newMeta };
  }

  async function claimItemDrop(messageId: string, claimerName: string, partyMemberId: string | null) {
    const msg = messages.value.find(m => m.id === messageId);
    if (!msg || msg.type !== 'item_drop') return;
    const existing = msg.metadata as ItemDropMetadata;
    if (existing.claimed_by_user_id) return;
    const newMeta: ItemDropMetadata = {
      ...existing,
      claimed_by_user_id: auth.user!.id,
      claimed_by_name: claimerName,
      claimed_party_member_id: partyMemberId,
    };
    const { error } = await supabase.from("campaign_messages").update({ metadata: newMeta }).eq("id", messageId);
    if (error) throw error;
    const idx = messages.value.findIndex(m => m.id === messageId);
    if (idx >= 0) messages.value[idx] = { ...messages.value[idx], metadata: newMeta };
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
    messages.value.push(msg);
    if (messages.value.length > LIMIT) messages.value.shift();
  }

  const myUserId = computed(() => auth.user?.id);

  return { messages, loading, sendMessage, sendRoll, sendItemDrop, claimItemDrop, sendCurrencyDrop, claimCurrencyDrop, deleteMessage, deleteAllMessages, myUserId };
}
