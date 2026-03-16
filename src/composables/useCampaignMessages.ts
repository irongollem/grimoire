import { ref, computed, watch, onUnmounted } from "vue";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { useAuthStore } from "@/stores/auth";
import type { CampaignMessage, CampaignMessageInsert, ItemDropMetadata } from "@/types/chat.types";
import type { RollResult } from "@/lib/dice";

const LIMIT = 100;

export function useCampaignMessages() {
  const campaign = useCampaignStore();
  const auth = useAuthStore();

  const messages = ref<CampaignMessage[]>([]);
  const loading = ref(false);
  let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

  async function fetchMessages(campaignId: string) {
    loading.value = true;
    const { data, error } = await supabase
      .from("campaign_messages")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: true })
      .limit(LIMIT);
    if (!error) messages.value = (data ?? []) as CampaignMessage[];
    loading.value = false;
  }

  function subscribe(campaignId: string) {
    if (realtimeChannel) supabase.removeChannel(realtimeChannel);
    realtimeChannel = supabase
      .channel(`campaign-messages:${campaignId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "campaign_messages",
          filter: `campaign_id=eq.${campaignId}`,
        },
        (payload) => {
          const msg = payload.new as CampaignMessage;
          // RLS already filters, but double-check private messages on client
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
        {
          event: "UPDATE",
          schema: "public",
          table: "campaign_messages",
          filter: `campaign_id=eq.${campaignId}`,
        },
        (payload) => {
          const updated = payload.new as CampaignMessage;
          const idx = messages.value.findIndex(m => m.id === updated.id);
          if (idx >= 0) messages.value[idx] = updated;
        },
      )
      .subscribe();
  }

  const stopWatch = watch(
    () => campaign.activeCampaignId,
    async (id) => {
      messages.value = [];
      if (id) { await fetchMessages(id); subscribe(id); }
    },
    { immediate: true },
  );

  onUnmounted(() => {
    stopWatch();
    if (realtimeChannel) supabase.removeChannel(realtimeChannel);
  });

  async function sendMessage(text: string, recipientUserId: string | null = null) {
    const cid = campaign.activeCampaignId;
    if (!cid || !auth.user?.id || !text.trim()) return;
    const msg: CampaignMessageInsert = {
      campaign_id: cid,
      user_id: auth.user.id,
      recipient_user_id: recipientUserId,
      sender_name: auth.membership?.display_name ?? auth.userEmail ?? "Unknown",
      message: text.trim(),
      type: "chat",
      metadata: null,
    };
    await supabase.from("campaign_messages").insert(msg);
  }

  async function sendRoll(result: RollResult, recipientUserId: string | null = null) {
    const cid = campaign.activeCampaignId;
    if (!cid || !auth.user?.id) return;
    const msg: CampaignMessageInsert = {
      campaign_id: cid,
      user_id: auth.user.id,
      recipient_user_id: recipientUserId,
      sender_name: auth.membership?.display_name ?? auth.userEmail ?? "Unknown",
      message: `rolled ${result.label} = ${result.total}`,
      type: "roll",
      metadata: result,
    };
    await supabase.from("campaign_messages").insert(msg);
  }

  async function sendItemDrop(itemName: string, itemId: string | null, quantity: number, rarity: string | null) {
    const cid = campaign.activeCampaignId;
    if (!cid || !auth.user?.id) return;
    const metadata: ItemDropMetadata = {
      item_id: itemId,
      item_name: itemName,
      item_rarity: rarity,
      quantity,
      claimed_by_user_id: null,
      claimed_by_name: null,
      claimed_party_member_id: null,
    };
    const msg: CampaignMessageInsert = {
      campaign_id: cid,
      user_id: auth.user.id,
      recipient_user_id: null,
      sender_name: auth.membership?.display_name ?? auth.userEmail ?? "Unknown",
      message: `dropped ${quantity > 1 ? `${quantity}x ` : ""}${itemName}`,
      type: "item_drop",
      metadata,
    };
    await supabase.from("campaign_messages").insert(msg);
  }

  async function claimItemDrop(messageId: string, claimerName: string, partyMemberId: string | null) {
    const msg = messages.value.find(m => m.id === messageId);
    if (!msg || msg.type !== 'item_drop') return;
    const existing = msg.metadata as ItemDropMetadata;
    if (existing.claimed_by_user_id) return; // already claimed
    const newMeta: ItemDropMetadata = {
      ...existing,
      claimed_by_user_id: auth.user!.id,
      claimed_by_name: claimerName,
      claimed_party_member_id: partyMemberId,
    };
    const { error } = await supabase
      .from("campaign_messages")
      .update({ metadata: newMeta })
      .eq("id", messageId);
    if (!error) {
      // Optimistic update
      const idx = messages.value.findIndex(m => m.id === messageId);
      if (idx >= 0) messages.value[idx] = { ...messages.value[idx], metadata: newMeta };
    }
  }

  async function deleteMessage(id: string) {
    await supabase.from("campaign_messages").delete().eq("id", id);
    messages.value = messages.value.filter((m) => m.id !== id);
  }

  const myUserId = computed(() => auth.user?.id);

  return { messages, loading, sendMessage, sendRoll, sendItemDrop, claimItemDrop, deleteMessage, myUserId };
}
