import { ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useSoundboardStore } from "@/stores/soundboard";
import { useCampaignStore } from "@/stores/campaign";
import type { SoundboardBroadcastState } from "@/types/sound.types";

/**
 * The DM half of shared playback: push what the music slot is doing so remote
 * players can follow along.
 *
 * **Per session, and off by default.** A remote game is a decision you make
 * tonight, not a property of the campaign — and the default matters, because
 * most tables using this are in one room, where several devices playing the
 * same track comb-filter into a flanged mess. So the flag lives in memory and
 * is gone on reload rather than being persisted anywhere.
 *
 * Only the **music** slot is shared. Ambience is unsynchronised by nature and
 * one-shot effects would land a second apart across a group, which is worse
 * than not sending them at all.
 */

// Module-level so the widget toggle and any other surface see the same flag.
const broadcasting = ref(false);
const broadcastError = ref<string | null>(null);

export function useSoundboardBroadcast() {
  const store = useSoundboardStore();
  const { activeCampaignId } = storeToRefs(useCampaignStore());

  /**
   * Snapshot of the music slot.
   *
   * `started_at` is an **anchor**, not a position: the wall-clock instant that
   * corresponds to position zero of this track. A player joining thirty seconds
   * late computes their own offset from it, where a position pushed over the
   * wire would already be stale by the time it arrived.
   */
  function currentState(): SoundboardBroadcastState {
    const mpl = store.activeMusicPlaylist;
    if (!broadcasting.value || mpl === null) {
      return {
        is_live: broadcasting.value,
        sound_id: null, track_name: null, track_url: null,
        artist: null, thumbnail_url: null, playlist_name: null,
        started_at: null, is_paused: false, paused_at: null,
      };
    }

    const soundId = mpl.trackSoundIds[mpl.currentIndex];
    const elapsedMs = store.getState(soundId).currentTime * 1000;
    const now = Date.now();

    return {
      is_live: true,
      sound_id: soundId,
      track_name: mpl.soundNames[soundId],
      track_url: mpl.fileUrls[soundId],
      artist: mpl.artists[soundId],
      thumbnail_url: mpl.thumbnailUrls[soundId],
      playlist_name: mpl.playlistName,
      started_at: new Date(now - elapsedMs).toISOString(),
      is_paused: mpl.paused,
      paused_at: mpl.paused ? new Date(now).toISOString() : null,
    };
  }

  async function push(): Promise<void> {
    const campaignId = activeCampaignId.value;
    if (!campaignId) return;
    const user = getCurrentUser();
    if (!user) return;

    const { error } = await supabase
      .from("soundboard_broadcast")
      .upsert(
        { campaign_id: campaignId, user_id: user.id, ...currentState() },
        { onConflict: "campaign_id" },
      );
    broadcastError.value = error === null ? null : error.message;
  }

  function setBroadcasting(next: boolean): void {
    broadcasting.value = next;
    void push();
  }

  // Pushed on the events that change what a player should hear — a track
  // change, a pause, a stop — and deliberately NOT on timeupdate. The anchor
  // means position needs no ticking, and a row rewritten several times a second
  // would be a realtime message per second per campaign for no benefit.
  watch(
    () => {
      const mpl = store.activeMusicPlaylist;
      if (mpl === null) return "idle";
      return `${mpl.playlistId}:${mpl.currentIndex}:${mpl.paused}`;
    },
    () => {
      if (broadcasting.value) void push();
    },
  );

  return { broadcasting, broadcastError, setBroadcasting };
}
