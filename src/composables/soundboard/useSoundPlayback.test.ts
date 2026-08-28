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
  stop: vi.fn(),
};

const spotifyStore = {
  isReady: true,
  isPlaying: false,
  lastPlayedUrl: null as string | null,
  play: vi.fn(),
  pause: vi.fn(),
};

vi.mock("@/stores/soundboard", () => ({ useSoundboardStore: () => soundboardStore }));
vi.mock("@/stores/spotify", () => ({ useSpotifyStore: () => spotifyStore }));

const { useSoundTrigger, useSoundToggle, useActionCheck } = await import("./useSoundPlayback");

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
