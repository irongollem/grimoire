import { ref, watch, onUnmounted } from "vue";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";

export interface BroadcastMessage {
  id: string;
  type: "announcement" | "quest_shared" | "note_shared" | "item_added";
  text: string;
  sent_at: string;
}

// Module-level channel shared between DM sender and player receiver
let broadcastChannel: ReturnType<typeof supabase.channel> | null = null;
let broadcastCampaignId: string | null = null;
let _broadcastRefCount = 0;

function getBroadcastChannel(campaignId: string) {
  if (broadcastChannel && broadcastCampaignId === campaignId) return broadcastChannel;
  if (broadcastChannel) {
    supabase.removeChannel(broadcastChannel);
    broadcastChannel = null;
  }
  broadcastCampaignId = campaignId;
  broadcastChannel = supabase
    .channel(`campaign-broadcast:${campaignId}`)
    .subscribe();
  return broadcastChannel;
}

/** DM: send a broadcast to all players in the campaign */
export async function sendCampaignAnnouncement(campaignId: string, text: string) {
  const ch = getBroadcastChannel(campaignId);
  const msg: BroadcastMessage = {
    id: crypto.randomUUID(),
    type: "announcement",
    text,
    sent_at: new Date().toISOString(),
  };
  await ch.send({ type: "broadcast", event: "announcement", payload: msg });
}

/** Composable for players/DMs to receive broadcast messages */
export function useCampaignBroadcast() {
  const campaign = useCampaignStore();
  const messages = ref<BroadcastMessage[]>([]);
  let localChannel: ReturnType<typeof supabase.channel> | null = null;

  _broadcastRefCount++;

  function subscribe(campaignId: string) {
    if (localChannel) {
      supabase.removeChannel(localChannel);
    }
    localChannel = supabase
      .channel(`campaign-broadcast-rx:${campaignId}-${Math.random()}`)
      .on("broadcast", { event: "announcement" }, ({ payload }) => {
        messages.value.unshift(payload as BroadcastMessage);
        // Auto-dismiss after 30s
        setTimeout(() => {
          messages.value = messages.value.filter((m) => m.id !== payload.id);
        }, 30_000);
      })
      .subscribe();
  }

  const stopWatch = watch(
    () => campaign.activeCampaignId,
    (id) => { if (id) subscribe(id); },
    { immediate: true },
  );

  onUnmounted(() => {
    stopWatch();
    _broadcastRefCount--;
    if (localChannel) {
      supabase.removeChannel(localChannel);
      localChannel = null;
    }
  });

  function dismiss(id: string) {
    messages.value = messages.value.filter((m) => m.id !== id);
  }

  return { messages, dismiss };
}
