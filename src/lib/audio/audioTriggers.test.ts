import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  onAudioTrigger,
  requestAudioTheme,
  requestAudioCue,
  releaseAudioTheme,
  clearAudioTriggerHandlers,
  type AudioTriggerEvent,
} from "@/lib/audio/audioTriggers";

const REQUEST = {
  sourceId: "enc-1",
  theme: "battle",
  slot: "music",
  label: "Goblin ambush",
  kind: "encounter",
} as const;

const CUE = {
  sourceId: "beat:b1:a1",
  kind: "beat",
  label: "Beat · The ambush",
  slot: "music",
  target: { playlistId: "battle" },
} as const;

beforeEach(() => {
  clearAudioTriggerHandlers();
});

describe("audio trigger bus", () => {
  it("delivers a request to every subscriber", () => {
    const a = vi.fn<(e: AudioTriggerEvent) => void>();
    const b = vi.fn<(e: AudioTriggerEvent) => void>();
    onAudioTrigger(a);
    onAudioTrigger(b);

    requestAudioTheme({ ...REQUEST });

    expect(a).toHaveBeenCalledWith({ type: "request", request: { ...REQUEST } });
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("stops delivering after unsubscribe", () => {
    const handler = vi.fn<(e: AudioTriggerEvent) => void>();
    const off = onAudioTrigger(handler);
    off();

    requestAudioTheme({ ...REQUEST });
    expect(handler).not.toHaveBeenCalled();
  });

  it("ignores a request with no theme", () => {
    const handler = vi.fn<(e: AudioTriggerEvent) => void>();
    onAudioTrigger(handler);

    requestAudioTheme({ ...REQUEST, theme: "   " });
    expect(handler).not.toHaveBeenCalled();
  });

  it("carries the source through a release so ownership can be checked", () => {
    const handler = vi.fn<(e: AudioTriggerEvent) => void>();
    onAudioTrigger(handler);

    releaseAudioTheme("enc-1");
    expect(handler).toHaveBeenCalledWith({ type: "release", sourceId: "enc-1" });
  });

  it("survives a handler that unsubscribes itself mid-delivery", () => {
    const second = vi.fn<(e: AudioTriggerEvent) => void>();
    const off = onAudioTrigger(() => off());
    onAudioTrigger(second);

    // Mutating the handler set during iteration must not skip the next one.
    expect(() => requestAudioTheme({ ...REQUEST })).not.toThrow();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("delivers a cue as its own event shape, distinct from a theme request", () => {
    const handler = vi.fn<(e: AudioTriggerEvent) => void>();
    onAudioTrigger(handler);

    requestAudioCue({ ...CUE });

    expect(handler).toHaveBeenCalledWith({ type: "cue", request: { ...CUE } });
  });

  it("delivers a cue targeting a bare sound, not just a playlist", () => {
    const handler = vi.fn<(e: AudioTriggerEvent) => void>();
    onAudioTrigger(handler);

    const soundCue = { ...CUE, slot: "ambient", target: { soundId: "s1" } } as const;
    requestAudioCue(soundCue);

    expect(handler).toHaveBeenCalledWith({ type: "cue", request: soundCue });
  });

  it("releases a cue through the same verb a theme releases through", () => {
    const handler = vi.fn<(e: AudioTriggerEvent) => void>();
    onAudioTrigger(handler);

    releaseAudioTheme(CUE.sourceId);
    expect(handler).toHaveBeenCalledWith({ type: "release", sourceId: CUE.sourceId });
  });
});
