import { ref, computed, onUnmounted, watch } from "vue";
import { storeToRefs } from "pinia";
import { supabase } from "@/lib/supabase";
import { createRealtimeHeal, type RealtimeHeal } from "@/lib/realtimeHeal";
import { useCampaignStore } from "@/stores/campaign";
import { broadcastOffsetSeconds, shouldResync } from "@/lib/broadcastOffset";
import type { SoundboardBroadcast } from "@/types/sound.types";

/**
 * The player half of shared playback: follow whatever the DM is sharing.
 *
 * Two constraints shape all of this.
 *
 * **A browser will not start audio without a gesture from that player.** No
 * amount of state syncing changes that, so joining is an explicit act and the
 * "Join audio" button is a requirement rather than a courtesy. It also happens
 * to be the right consent model: nobody's speakers should come alive because
 * someone else pressed play.
 *
 * **Sync is approximate.** Each client plays its own copy of the file, seeked
 * to the offset implied by the DM's anchor. That is fine for music, which is
 * what this carries, and would be useless for one-shot effects, which it
 * deliberately does not.
 */

export function usePlayerAudioStream() {
  const { activeCampaignId } = storeToRefs(useCampaignStore());

  const broadcast = ref<SoundboardBroadcast | null>(null);
  /** The player has opted in on this device. Never assumed. */
  const joined = ref(false);
  const volume = ref(0.7);
  const blocked = ref(false);

  const audio = new Audio();
  audio.preload = "auto";
  audio.volume = volume.value;

  const isOffered = computed(() => broadcast.value !== null && broadcast.value.is_live);
  const trackName = computed(() => broadcast.value?.track_name ?? null);
  const playlistName = computed(() => broadcast.value?.playlist_name ?? null);
  const artist = computed(() => broadcast.value?.artist ?? null);

  function apply(): void {
    const row = broadcast.value;

    if (!joined.value || row === null || !row.is_live || row.track_url === null) {
      audio.pause();
      return;
    }

    const target = broadcastOffsetSeconds(row, Date.now());
    if (audio.src !== row.track_url) {
      audio.src = row.track_url;
      audio.currentTime = target;
    } else if (shouldResync(audio.currentTime, target)) {
      // Only correct real drift. Nudging constantly is audible; being a couple
      // of seconds behind the DM is not.
      audio.currentTime = target;
    }

    if (row.is_paused) {
      audio.pause();
      return;
    }

    void audio.play().catch(() => {
      // The gesture did not carry, or the device refused. Say so instead of
      // showing a player a "playing" state over silence.
      blocked.value = true;
      joined.value = false;
    });
  }

  /** Must be called from a real user gesture, or the browser refuses. */
  function join(): void {
    blocked.value = false;
    joined.value = true;
    apply();
  }

  function leave(): void {
    joined.value = false;
    audio.pause();
  }

  function setVolume(next: number): void {
    volume.value = Math.max(0, Math.min(1, next));
    audio.volume = volume.value;
  }

  async function load(campaignId: string): Promise<void> {
    const { data } = await supabase
      .from("soundboard_broadcast")
      .select("*")
      .eq("campaign_id", campaignId)
      .maybeSingle();
    broadcast.value = data === null ? null : (data as SoundboardBroadcast);
    apply();
  }

  let channel: ReturnType<typeof supabase.channel> | null = null;
  let heal: RealtimeHeal | null = null;

  function subscribe(campaignId: string): void {
    unsubscribe();
    void load(campaignId);
    // Recovery re-reads the broadcast row, so a player who dropped mid-session
    // lands back on whatever the DM is actually playing instead of a track that
    // stopped being shared while they were disconnected.
    //
    // Left on the default hidden threshold rather than reconciling on every
    // return to the tab: load() calls apply(), which seeks and plays, so a
    // refetch per alt-tab would be audible.
    heal = createRealtimeHeal(() => void load(campaignId));
    channel = supabase
      .channel(`soundboard_broadcast:${campaignId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "soundboard_broadcast", filter: `campaign_id=eq.${campaignId}` },
        (payload) => {
          broadcast.value = payload.eventType === "DELETE" ? null : (payload.new as SoundboardBroadcast);
          apply();
        },
      )
      .subscribe((status) => heal?.onStatus(status));
  }

  function unsubscribe(): void {
    // Detach first: removeChannel() fires CLOSED, which must not flag a handle
    // we are dropping anyway.
    heal?.detach();
    heal = null;
    if (channel === null) return;
    void supabase.removeChannel(channel);
    channel = null;
  }

  watch(
    activeCampaignId,
    (id) => {
      leave();
      if (id) subscribe(id);
      else unsubscribe();
    },
    { immediate: true },
  );

  onUnmounted(() => {
    unsubscribe();
    audio.pause();
    audio.src = "";
  });

  return { isOffered, joined, blocked, volume, trackName, playlistName, artist, join, leave, setVolume };
}
