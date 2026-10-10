import { ref, watch, onUnmounted } from "vue";
import { supabase } from "@/lib/supabase";
import { createRealtimeChannel, type RealtimeChannelHandle } from "@/lib/campaignLiveSync/realtimeChannel";
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

function sync(channel: PresenceChannel, handle: RealtimeChannelHandle) {
  if (realtime !== handle) return;
  const state = channel.presenceState<PresenceUser>();
  onlineUsers.value = Object.values(state).flat();
}

function connect(campaignId: string, userId: string, displayName: string | null) {
  if (realtime) return; // already connected

  // Callbacks compare against this connection's own handle: one that arrives
  // after the subscription was replaced must not re-track the old
  // campaign/user or overwrite the new roster.
  let channel: PresenceChannel | null = null;
  const handle: RealtimeChannelHandle = createRealtimeChannel({
    topic: `campaign:${campaignId}`,
    bind: (nextChannel) => {
      channel = nextChannel;
      return nextChannel
        .on("presence", { event: "sync" }, () => sync(nextChannel, handle))
        .on("presence", { event: "join" }, () => sync(nextChannel, handle))
        .on("presence", { event: "leave" }, () => sync(nextChannel, handle));
    },
    onStatus: (status) => {
      if (status === "SUBSCRIBED" && channel && realtime === handle) {
        void channel.track({
          user_id: userId,
          display_name: displayName,
          online_at: new Date().toISOString(),
        });
      }
    },
  });
  realtime = handle;
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
