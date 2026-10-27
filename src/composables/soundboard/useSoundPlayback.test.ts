import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Sound } from "@/types/sound.types";

/**
 * The rule a soundboard lives or dies by: **hitting the thunderclap twice
 * gives you two thunderclaps.**
 *
 * `toggle` is transport semantics — playing means pause, whatever it is. That
 * is right for a play/pause button and wrong for a fire target, which is what
 * both the command palette and the pad grid are. The two were indistinguishable
 * from the outside until a pad shipped wired to the wrong one, so the
 * difference is pinned here.
 */

const soundboardStore = {
  getState: vi.fn(() => ({ isPlaying: false, loadError: false })),
  play: vi.fn(),
  pause: vi.fn(),
  restart: vi.fn(),
  toggleLoop: vi.fn(),
  stop: vi.fn(),
};

const spotifyStore = {
  isReady: true as boolean,
  isPlaying: false,
  lastPlayedUrl: null as string | null,
  repeatMode: 0 as 0 | 1 | 2,
  play: vi.fn(),
  pause: vi.fn(),
  setRepeat: vi.fn(),
};

vi.mock("@/stores/soundboard", () => ({ useSoundboardStore: () => soundboardStore }));
vi.mock("@/stores/spotify", () => ({ useSpotifyStore: () => spotifyStore }));

const { useSoundTrigger, useSoundToggle, useActionCheck, useSoundPlayback, useBlockedCheck, useAudibleCheck } = await import("./useSoundPlayback");

function sound(over: Partial<Sound> = {}): Sound {
  return {
    id: "s1",
    name: "Thunderclap",
    category: "effects",
    source_type: "url",
    file_url: "https://example.test/thunder.mp3",
    storage_path: null,
    gain_trim: 1,
    ...over,
  } as Sound;
}

/** Make the next `isPlaying` check answer true. */
function setAudible(playing: boolean): void {
  soundboardStore.getState.mockReturnValue({ isPlaying: playing, loadError: false });
}

beforeEach(() => {
  vi.clearAllMocks();
  setAudible(false);
  spotifyStore.isPlaying = false;
  spotifyStore.lastPlayedUrl = null;
  spotifyStore.repeatMode = 0;
});

describe("what the next press does", () => {
  it("calls a playing one-shot a refire, not a pause", () => {
    setAudible(true);
    expect(useActionCheck()(sound({ category: "effects" }))).toBe("refire");
  });

  it("calls a playing bed a pause", () => {
    setAudible(true);
    expect(useActionCheck()(sound({ category: "ambient" }))).toBe("pause");
    expect(useActionCheck()(sound({ category: "music" }))).toBe("pause");
  });

  it("calls anything silent a play", () => {
    expect(useActionCheck()(sound({ category: "effects" }))).toBe("play");
  });
});

describe("useSoundTrigger — fire-target semantics", () => {
  it("restarts a one-shot that is already playing", () => {
    // The whole point of a pad. Two presses, two thunderclaps.
    setAudible(true);
    useSoundTrigger()(sound({ category: "effects" }));

    expect(soundboardStore.restart).toHaveBeenCalledTimes(1);
    expect(soundboardStore.pause).not.toHaveBeenCalled();
  });

  it("pauses a bed that is already playing rather than restarting it", () => {
    // Restarting a tavern from the top mid-scene would be worse than useless.
    setAudible(true);
    useSoundTrigger()(sound({ category: "ambient" }));

    expect(soundboardStore.pause).toHaveBeenCalledTimes(1);
    expect(soundboardStore.restart).not.toHaveBeenCalled();
  });

  it("plays anything that is silent", () => {
    useSoundTrigger()(sound({ category: "effects" }));
    expect(soundboardStore.play).toHaveBeenCalledTimes(1);
  });

  it("does nothing at all when the sound is blocked", () => {
    // Safari cannot play WebM, so firing it would show a playing state over
    // silence.
    soundboardStore.getState.mockReturnValue({ isPlaying: false, loadError: true });
    useSoundTrigger()(sound());

    expect(soundboardStore.play).not.toHaveBeenCalled();
    expect(soundboardStore.restart).not.toHaveBeenCalled();
  });

  it("never restarts a Spotify track — its SDK owns the transport", () => {
    spotifyStore.lastPlayedUrl = "spotify:track:1";
    spotifyStore.isPlaying = true;
    useSoundTrigger()(sound({ source_type: "spotify", file_url: "spotify:track:1" }));

    expect(soundboardStore.restart).not.toHaveBeenCalled();
    expect(spotifyStore.pause).toHaveBeenCalledTimes(1);
  });
});

describe("useSoundToggle — transport semantics", () => {
  it("pauses a playing one-shot, unlike trigger", () => {
    // This is the distinction that matters: same sound, same state, different
    // outcome, because a play/pause button and a pad are not the same control.
    setAudible(true);
    useSoundToggle()(sound({ category: "effects" }));

    expect(soundboardStore.pause).toHaveBeenCalledTimes(1);
    expect(soundboardStore.restart).not.toHaveBeenCalled();
  });
});

describe("loop — a Spotify track on the board loops like any pad", () => {
  const track = () => sound({ source_type: "spotify", category: "music", file_url: "spotify:track:1" });

  it("puts Spotify on repeat-track, since it has no per-sound loop", () => {
    useSoundPlayback(track).toggleLoop();
    expect(spotifyStore.setRepeat).toHaveBeenCalledWith(2);
    expect(soundboardStore.toggleLoop).not.toHaveBeenCalled();
  });

  it("turns repeat off again from repeat-track", () => {
    spotifyStore.repeatMode = 2;
    useSoundPlayback(track).toggleLoop();
    expect(spotifyStore.setRepeat).toHaveBeenCalledWith(0);
  });

  it("reads as looping only while it is the track loaded", () => {
    // Repeat is player-wide: another pad's repeat must not light this one.
    spotifyStore.repeatMode = 2;
    expect(useSoundPlayback(track).isLooping.value).toBe(false);
    spotifyStore.lastPlayedUrl = "spotify:track:1";
    expect(useSoundPlayback(track).isLooping.value).toBe(true);
  });

  it("leaves an audio sound's loop to the soundboard store", () => {
    useSoundPlayback(() => sound()).toggleLoop();
    expect(soundboardStore.toggleLoop).toHaveBeenCalledWith("s1");
    expect(spotifyStore.setRepeat).not.toHaveBeenCalled();
  });
});

describe("what is audible", () => {
  const track = () => sound({ source_type: "spotify", category: "music", file_url: "spotify:track:1" });

  it("counts a Spotify track as audible only while it is the loaded one and the player is playing", () => {
    const audible = useAudibleCheck();
    spotifyStore.lastPlayedUrl = "spotify:track:1";
    spotifyStore.isPlaying = false;
    expect(audible(track())).toBe(false);
    spotifyStore.isPlaying = true;
    spotifyStore.lastPlayedUrl = "spotify:track:other";
    expect(audible(track())).toBe(false);
    spotifyStore.lastPlayedUrl = "spotify:track:1";
    expect(audible(track())).toBe(true);
  });
});

describe("what blocks a sound", () => {
  it("holds a Spotify track back until the device is ready, and does not fire it", () => {
    spotifyStore.isReady = false;
    expect(useBlockedCheck()(sound({ source_type: "spotify", file_url: "spotify:track:1" }))).toBe("Connecting to Spotify device…");
    useSoundToggle()(sound({ source_type: "spotify", file_url: "spotify:track:1" }));
    useSoundTrigger()(sound({ source_type: "spotify", file_url: "spotify:track:1" }));
    expect(spotifyStore.play).not.toHaveBeenCalled();
    spotifyStore.isReady = true;
    expect(useBlockedCheck()(sound({ source_type: "spotify", file_url: "spotify:track:1" }))).toBeNull();
  });

  it("reports a load failure, and nothing else, for an ordinary sound", () => {
    expect(useBlockedCheck()(sound())).toBeNull();
    soundboardStore.getState.mockReturnValue({ isPlaying: false, loadError: true });
    expect(useBlockedCheck()(sound())).toBe("Failed to load");
  });

  const SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

  it.each([
    ["a .webm file", { file_url: "https://cdn.example/a.webm" }, "WebM: cannot play in Safari"],
    ["a .webm behind a query string", { file_url: "https://cdn.example/a.webm?token=1" }, "WebM: cannot play in Safari"],
    ["a .webm storage path under a different url", { file_url: "https://cdn.example/a", storage_path: "u/a.webm" }, "WebM: cannot play in Safari"],
    ["an mp3", { file_url: "https://cdn.example/a.mp3" }, null],
  ])("in Safari, %s is %s", async (_label, over, expected) => {
    vi.resetModules();
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(SAFARI);
    const fresh = await import("./useSoundPlayback");
    expect(fresh.useBlockedCheck()(sound(over))).toBe(expected);
    vi.restoreAllMocks();
  });

  it("lets Chrome play the same .webm", async () => {
    expect(useBlockedCheck()(sound({ file_url: "https://cdn.example/a.webm" }))).toBeNull();
  });
});

describe("what a press sends to the stores", () => {
  it("starts a silent sound on its own bus at its own gain", () => {
    useSoundToggle()(sound({ category: "ambient", gain_trim: 0.7 }));
    expect(soundboardStore.play).toHaveBeenCalledWith("s1", "https://example.test/thunder.mp3", "ambient", 0.7);
  });

  it("restarts a playing one-shot on the effects bus at its own gain", () => {
    setAudible(true);
    useSoundTrigger()(sound({ category: "effects", gain_trim: 0.7 }));
    expect(soundboardStore.restart).toHaveBeenCalledWith("s1", "https://example.test/thunder.mp3", "effects", 0.7);
  });

  it("plays a silent Spotify track by its uri", () => {
    useSoundToggle()(sound({ source_type: "spotify", category: "music", file_url: "spotify:track:9" }));
    expect(spotifyStore.play).toHaveBeenCalledWith("spotify:track:9");
    expect(soundboardStore.play).not.toHaveBeenCalled();
  });

  it("stops a Spotify track by pausing the player and an audio sound through the soundboard", () => {
    useSoundPlayback(() => sound({ source_type: "spotify", file_url: "spotify:track:9" })).stop();
    expect(spotifyStore.pause).toHaveBeenCalledTimes(1);
    expect(soundboardStore.stop).not.toHaveBeenCalled();
    useSoundPlayback(() => sound()).stop();
    expect(soundboardStore.stop).toHaveBeenCalledWith("s1");
  });
});
