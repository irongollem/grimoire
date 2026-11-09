import { onScopeDispose, ref } from "vue";
import { type Song, songVolume } from "@/lib/songs/songShelf";

/**
 * One song at a time for the songs page (/songs). A plain audio element, not
 * the soundboard store: that is the DM's instrument, with buses, lanes, cast
 * and broadcast, and none of it belongs on a child's phone.
 *
 * A tap on a song plays it from the start; a tap on the song that is playing
 * pauses it, and another tap carries on. A song plays to its end and stops, so
 * what plays is always the button that was pressed.
 */
export function useSongPlayer(createAudio: () => HTMLAudioElement = () => new Audio()) {
  const currentId = ref<string | null>(null);
  const playing = ref(false);
  /** 0 to 1 through the current song. */
  const progress = ref(0);
  const failedId = ref<string | null>(null);

  let audio: HTMLAudioElement | null = null;

  function element(): HTMLAudioElement {
    if (audio) return audio;
    const el = createAudio();
    el.preload = "auto";
    el.addEventListener("playing", () => {
      playing.value = true;
    });
    el.addEventListener("pause", () => {
      playing.value = false;
    });
    el.addEventListener("ended", () => {
      playing.value = false;
      progress.value = 0;
      currentId.value = null;
      setMediaState("none");
    });
    el.addEventListener("timeupdate", () => {
      progress.value = el.duration > 0 ? el.currentTime / el.duration : 0;
    });
    audio = el;
    return el;
  }

  function setMediaState(state: MediaSessionPlaybackState) {
    if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
      navigator.mediaSession.playbackState = state;
    }
  }

  function announce(song: Song) {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: song.name,
      artist: song.artist ?? "Dungeon Grimoire",
      artwork: song.coverUrl ? [{ src: song.coverUrl, sizes: "512x512" }] : [],
    });
    navigator.mediaSession.setActionHandler("play", () => void resume());
    navigator.mediaSession.setActionHandler("pause", () => audio?.pause());
  }

  async function resume() {
    if (!audio) return;
    try {
      await audio.play();
      setMediaState("playing");
    } catch {
      // A play the browser refused (no gesture, an unplayable file) leaves the button off.
      playing.value = false;
    }
  }

  /** What a tap on a song's button does. */
  async function tap(song: Song) {
    const el = element();
    if (currentId.value === song.id) {
      if (playing.value) {
        el.pause();
        setMediaState("paused");
      } else {
        await resume();
      }
      return;
    }
    el.pause();
    currentId.value = song.id;
    failedId.value = null;
    progress.value = 0;
    el.src = song.url;
    el.volume = songVolume(song.gainTrim);
    announce(song);
    try {
      await el.play();
      setMediaState("playing");
    } catch (e) {
      // A newer tap replaced this song while it loaded: not a failure of this one.
      if (currentId.value !== song.id) return;
      if (e instanceof DOMException && e.name === "AbortError") return;
      failedId.value = song.id;
      currentId.value = null;
      playing.value = false;
    }
  }

  onScopeDispose(() => {
    if (!audio) return;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    audio = null;
  });

  return { currentId, playing, progress, failedId, tap };
}
