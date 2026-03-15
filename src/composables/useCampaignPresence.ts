import { ref, watch, onUnmounted } from "vue";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { useAuthStore } from "@/stores/auth";

export interface PresenceUser {
  user_id: string;
  display_name: string | null;
  online_at: string;
}

// Module-level singleton so multiple callers share one channel
let channel: ReturnType<typeof supabase.channel> | null = null;
let refCount = 0;
const onlineUsers = ref<PresenceUser[]>([]);

function sync() {
  if (!channel) return;
  const state = channel.presenceState<PresenceUser>();
  onlineUsers.value = Object.values(state).flat();
}

function connect(campaignId: string, userId: string, displayName: string | null) {
  if (channel) return; // already connected

  channel = supabase.channel(`campaign:${campaignId}`)
    .on("presence", { event: "sync" }, sync)
    .on("presence", { event: "join" }, sync)
    .on("presence", { event: "leave" }, sync)
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel!.track({
          user_id: userId,
          display_name: displayName,
          online_at: new Date().toISOString(),
        });
      }
    });
}

function disconnect() {
  if (!channel) return;
  supabase.removeChannel(channel);
  channel = null;
  onlineUsers.value = [];
}

export function useCampaignPresence() {
  const campaign = useCampaignStore();
  const auth = useAuthStore();

  refCount++;

  const stopWatch = watch(
    () => [campaign.activeCampaignId, auth.user?.id] as const,
    ([campaignId, userId]) => {
      disconnect();
      if (campaignId && userId) {
        const displayName = auth.membership?.display_name ?? auth.userEmail ?? null;
        connect(campaignId, userId, displayName);
      }
    },
    { immediate: true },
  );

  onUnmounted(() => {
    stopWatch();
    refCount--;
    if (refCount === 0) disconnect();
  });

  return {
    onlineUsers,
    isOnline: (userId: string) => onlineUsers.value.some((u) => u.user_id === userId),
  };
}
