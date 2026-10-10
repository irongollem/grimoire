import { ref, computed, onUnmounted, watch } from "vue";
import { storeToRefs } from "pinia";
import { supabase } from "@/lib/supabase";
import { reportAsync } from "@/lib/campaignLiveSync/reportAsync";
import { onCampaignReconcile, onCampaignRing } from "@/lib/campaignLiveSync/rings";
import { useCampaignStore } from "@/stores/campaign";
import { broadcastOffsetSeconds, shouldResync } from "@/lib/audio/broadcastOffset";
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

  let subscribedCampaignId: string | null = null;

  async function load(campaignId: string): Promise<void> {
    const { data, error } = await supabase
      .from("soundboard_broadcast")
      .select("*")
      .eq("campaign_id", campaignId)
      .maybeSingle();
    // A failed read says nothing about what the DM is sharing; keep what we have.
    if (error) throw error;
    // A prior campaign's initial/recovery fetch may complete after the player
    // switches campaign. Its row must never restart or replace current audio.
    if (campaignId === subscribedCampaignId) {
      broadcast.value = data === null ? null : (data as SoundboardBroadcast);
      apply();
    }
  }

  let stopListening: (() => void) | null = null;

  function subscribe(campaignId: string): void {
    unsubscribe();
    subscribedCampaignId = campaignId;
    reportAsync(load(campaignId));
    // A `soundboard_broadcast` ring means the DM changed what is shared (the
    // row itself never travels), so re-read it.
    //
    // Reconcile re-reads the row as well, so a player who dropped mid-session
    // lands back on whatever the DM is actually playing instead of a track that
    // stopped being shared while they were disconnected. The campaign channel
    // reconciles only on a rejoin or a long sleep, not on every return to the
    // tab, and that is what we want: load() calls apply(), which seeks and
    // plays, so a refetch per alt-tab would be audible.
    const offRing = onCampaignRing(["soundboard_broadcast"], (ring) => {
      if (ring.campaignId === campaignId && subscribedCampaignId === campaignId) reportAsync(load(campaignId));
    });
    const offReconcile = onCampaignReconcile((id) => {
      if (id === campaignId && subscribedCampaignId === campaignId) reportAsync(load(campaignId));
    });
    stopListening = () => { offRing(); offReconcile(); };
  }

  function unsubscribe(): void {
    subscribedCampaignId = null;
    stopListening?.();
    stopListening = null;
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
