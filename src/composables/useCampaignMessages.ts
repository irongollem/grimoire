import { ref, computed, watch, onUnmounted } from "vue";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { useAuthStore } from "@/stores/auth";
import type { CampaignMessage, CampaignMessageInsert } from "@/types/chat.types";
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
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel);
    }
    realtimeChannel = supabase
      .channel(`campaign-messages:${campaignId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "campaign_messages", filter: `campaign_id=eq.${campaignId}` },
        (payload) => {
          messages.value.push(payload.new as CampaignMessage);
          if (messages.value.length > LIMIT) messages.value.shift();
        },
      )
      .subscribe();
  }

  const stopWatch = watch(
    () => campaign.activeCampaignId,
    async (id) => {
      messages.value = [];
      if (id) {
        await fetchMessages(id);
        subscribe(id);
      }
    },
    { immediate: true },
  );

  onUnmounted(() => {
    stopWatch();
    if (realtimeChannel) supabase.removeChannel(realtimeChannel);
  });

  async function sendMessage(text: string) {
    const cid = campaign.activeCampaignId;
    if (!cid || !auth.user?.id || !text.trim()) return;
    const senderName = auth.membership?.display_name ?? auth.userEmail ?? "Unknown";
    const msg: CampaignMessageInsert = {
      campaign_id: cid,
      user_id: auth.user.id,
      sender_name: senderName,
      message: text.trim(),
      type: "chat",
      metadata: null,
    };
    await supabase.from("campaign_messages").insert(msg);
  }

  async function sendRoll(result: RollResult) {
    const cid = campaign.activeCampaignId;
    if (!cid || !auth.user?.id) return;
    const senderName = auth.membership?.display_name ?? auth.userEmail ?? "Unknown";
    const msg: CampaignMessageInsert = {
      campaign_id: cid,
      user_id: auth.user.id,
      sender_name: senderName,
      message: `rolled ${result.label} = ${result.total}`,
      type: "roll",
      metadata: result,
    };
    await supabase.from("campaign_messages").insert(msg);
  }

  const myUserId = computed(() => auth.user?.id);

  return { messages, loading, sendMessage, sendRoll, myUserId };
}
