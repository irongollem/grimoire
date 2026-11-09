import { onScopeDispose, ref } from "vue";
import { type Song, songVolume } from "@/lib/songs/songShelf";

/**
 * One song at a time for the songs page (/songs). A plain audio element, not
 * the soundboard store: that is the DM's instrument, with buses, lanes, cast
 * and broadcast, and none of it belongs on a child's phone.
 *
 * A tap on a song plays it from the start; a tap on the song that is playing
 * (or still loading) pauses it, and another tap carries on. A song plays to its
 * end and stops, so what plays is always the button that was pressed.
 */
export function useSongPlayer(createAudio: () => HTMLAudioElement = () => new Audio()) {
  const currentId = ref<string | null>(null);
  /**
   * Whether the current song is meant to be heard: true from the tap, before
   * the browser has loaded a byte, so a second tap while it loads pauses it
   * rather than asking for it twice. The button shows this, not the element.
   */
  const playing = ref(false);
  /** 0 to 1 through the current song. */
  const progress = ref(0);
  const failedId = ref<string | null>(null);

  let audio: HTMLAudioElement | null = null;
  /** The lock-screen metadata this page set, so leaving clears only its own. */
  let ownMetadata: MediaMetadata | null = null;

  const hasMediaSession = () => typeof navigator !== "undefined" && "mediaSession" in navigator;

  function setMediaState(state: MediaSessionPlaybackState) {
    if (hasMediaSession()) navigator.mediaSession.playbackState = state;
  }

  /** The current song could not play: its button shows so, and nothing is left selected. */
  function fail(id: string) {
    failedId.value = id;
    currentId.value = null;
    playing.value = false;
    progress.value = 0;
    setMediaState("none");
  }

  function element(): HTMLAudioElement {
    if (audio) return audio;
    const el = createAudio();
    el.preload = "auto";
    el.addEventListener("playing", () => setMediaState("playing"));
    // A pause from outside the page (headphones, the lock screen, another app taking the audio) turns the button
    // off too. A pause queued by switching songs arrives after the new song's play() and finds the element
    // playing again, so it is ignored.
    el.addEventListener("pause", () => {
      if (!el.paused || el.ended) return;
      playing.value = false;
      setMediaState("paused");
    });
    el.addEventListener("ended", () => {
      playing.value = false;
      progress.value = 0;
      currentId.value = null;
      setMediaState("none");
    });
    // A file that breaks after it started (a decode error, a dropped download) fails like one that never started.
    el.addEventListener("error", () => {
      if (currentId.value) fail(currentId.value);
    });
    el.addEventListener("timeupdate", () => {
      progress.value = el.duration > 0 ? el.currentTime / el.duration : 0;
    });
    audio = el;
    return el;
  }

  function announce(song: Song) {
    if (!hasMediaSession() || typeof MediaMetadata === "undefined") return;
    ownMetadata = new MediaMetadata({
      title: song.name,
      artist: song.artist ?? "Dungeon Grimoire",
      artwork: song.coverUrl ? [{ src: song.coverUrl, sizes: "512x512" }] : [],
    });
    navigator.mediaSession.metadata = ownMetadata;
    navigator.mediaSession.setActionHandler("play", () => void start(song.id));
    navigator.mediaSession.setActionHandler("pause", () => pause());
  }

  function pause() {
    playing.value = false;
    audio?.pause();
  }

  /** Plays the current element, and marks `id` as failed if the browser refuses it. */
  async function start(id: string) {
    const el = element();
    playing.value = true;
    try {
      await el.play();
    } catch (e) {
      // A newer tap replaced this song, or a pause cancelled the load: neither is this song failing.
      if (currentId.value !== id) return;
      if (e instanceof DOMException && e.name === "AbortError") return;
      fail(id);
    }
  }

  /** What a tap on a song's button does. */
  async function tap(song: Song) {
    const el = element();
    if (currentId.value === song.id) {
      if (playing.value) pause();
      else await start(song.id);
      return;
    }
    el.pause();
    currentId.value = song.id;
    failedId.value = null;
    progress.value = 0;
    el.src = song.url;
    el.volume = songVolume(song.gainTrim);
    announce(song);
    await start(song.id);
  }

  onScopeDispose(() => {
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      audio = null;
    }
    // Hand the lock screen back, unless something else has taken it since.
    if (hasMediaSession() && ownMetadata && navigator.mediaSession.metadata === ownMetadata) {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.playbackState = "none";
    }
    ownMetadata = null;
  });

  return { currentId, playing, progress, failedId, tap };
}
