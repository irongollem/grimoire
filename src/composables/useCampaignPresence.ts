import { ref, watch, onUnmounted } from "vue";
import { supabase } from "@/lib/supabase";
import { createRealtimeChannel, type RealtimeChannelHandle } from "@/lib/realtimeChannel";
import { useCampaignStore } from "@/stores/campaign";
import { useAuthStore } from "@/stores/auth";

export interface PresenceUser {
  user_id: string;
  display_name: string | null;
  online_at: string;
}

// Module-level singleton so multiple callers share one channel.
// Unlike row subscriptions, Presence is itself the authoritative state: there
// is no HTTP snapshot to reconcile after a gap.
type PresenceChannel = ReturnType<typeof supabase.channel>;
let realtime: RealtimeChannelHandle | null = null;
let refCount = 0;
let stopWatcher: (() => void) | null = null;
const onlineUsers = ref<PresenceUser[]>([]);

function sync(channel: PresenceChannel) {
  if (realtime?.channel !== channel) return;
  const state = channel.presenceState<PresenceUser>();
  onlineUsers.value = Object.values(state).flat();
}

function connect(campaignId: string, userId: string, displayName: string | null) {
  if (realtime) return; // already connected

  let channel: PresenceChannel | null = null;
  realtime = createRealtimeChannel({
    topic: `campaign:${campaignId}`,
    bind: (nextChannel) => {
      channel = nextChannel;
      return nextChannel
        .on("presence", { event: "sync" }, () => sync(nextChannel))
        .on("presence", { event: "join" }, () => sync(nextChannel))
        .on("presence", { event: "leave" }, () => sync(nextChannel));
    },
    onStatus: (status) => {
      // The channel can report SUBSCRIBED after this subscription was replaced.
      // Do not let a stale callback re-track the old campaign/user.
      if (status === "SUBSCRIBED" && channel && realtime?.channel === channel) {
        void channel.track({
          user_id: userId,
          display_name: displayName,
          online_at: new Date().toISOString(),
        });
      }
    },
  });
}

function disconnect() {
  realtime?.stop();
  realtime = null;
  onlineUsers.value = [];
}

function ensureWatcher() {
  if (stopWatcher) return;
  const campaign = useCampaignStore();
  const auth = useAuthStore();
  stopWatcher = watch(
    () => [
      campaign.activeCampaignId,
      auth.user?.id,
      auth.publicName,
    ] as const,
    ([campaignId, userId, displayName]) => {
      disconnect();
      if (campaignId && userId) connect(campaignId, userId, displayName);
    },
    { immediate: true },
  );
}

export function useCampaignPresence() {
  refCount++;
  ensureWatcher();

  onUnmounted(() => {
    refCount--;
    if (refCount === 0) {
      stopWatcher?.();
      stopWatcher = null;
      disconnect();
    }
  });

  return {
    onlineUsers,
    isOnline: (userId: string) => onlineUsers.value.some((u) => u.user_id === userId),
  };
}
