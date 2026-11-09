import { describe, expect, it, vi } from "vitest";
import { effectScope } from "vue";
import type { Song } from "@/lib/songs/songShelf";
import { useSongPlayer } from "./useSongPlayer";

/** Just enough of an audio element: play and pause fire the events a browser fires. */
function fakeAudio() {
  const listeners: Record<string, Array<() => void>> = {};
  const el = {
    src: "",
    volume: 1,
    preload: "",
    currentTime: 0,
    duration: 0,
    addEventListener: (type: string, fn: () => void) => (listeners[type] ??= []).push(fn),
    fire: (type: string) => listeners[type]?.forEach((fn) => fn()),
    play: vi.fn(async () => el.fire("playing")),
    pause: vi.fn(() => el.fire("pause")),
    removeAttribute: vi.fn(),
    load: vi.fn(),
  };
  return el;
}

const song = (id: string): Song => ({
  id, name: id, url: `https://example.invalid/${id}.mp3`, coverUrl: null, artist: null, gainTrim: 1, picture: 0, colour: 0,
});

function setup() {
  const audio = fakeAudio();
  const scope = effectScope();
  const player = scope.run(() => useSongPlayer(() => audio as unknown as HTMLAudioElement))!;
  return { audio, player };
}

describe("useSongPlayer", () => {
  it("pauses the playing song when its button is tapped again, and carries on from there on the next tap", async () => {
    const { audio, player } = setup();
    await player.tap(song("a"));
    expect(player.playing.value).toBe(true);

    await player.tap(song("a"));
    expect(player.playing.value).toBe(false);
    expect(player.currentId.value).toBe("a");

    audio.src = "kept";
    await player.tap(song("a"));
    expect(player.playing.value).toBe(true);
    expect(audio.src).toBe("kept");
  });

  it("switches to another song from its start", async () => {
    const { audio, player } = setup();
    await player.tap(song("a"));
    await player.tap(song("b"));
    expect(player.currentId.value).toBe("b");
    expect(audio.src).toBe("https://example.invalid/b.mp3");
    expect(player.playing.value).toBe(true);
  });

  it("lets go of a song when it ends, so the button reads as off", async () => {
    const { audio, player } = setup();
    await player.tap(song("a"));
    audio.fire("pause");
    audio.fire("ended");
    expect(player.currentId.value).toBeNull();
    expect(player.playing.value).toBe(false);
  });

  it("marks a song the browser could not play", async () => {
    const { audio, player } = setup();
    audio.play.mockRejectedValueOnce(new DOMException("unsupported", "NotSupportedError"));
    await player.tap(song("a"));
    expect(player.failedId.value).toBe("a");
    expect(player.currentId.value).toBeNull();
  });
});
