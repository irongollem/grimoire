import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  onAudioTrigger,
  requestAudioTheme,
  releaseAudioTheme,
  clearAudioTriggerHandlers,
  type AudioTriggerEvent,
} from "@/lib/audioTriggers";

const REQUEST = {
  sourceId: "enc-1",
  theme: "battle",
  slot: "music",
  label: "Goblin ambush",
  kind: "encounter",
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
});
