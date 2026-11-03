import { describe, expect, it } from "vitest";
import { resolvePlayOptions, setRate } from "./playOptions";

describe("resolvePlayOptions", () => {
  it("is neutral when a press asked for nothing, so one press's velocity never leaks into the next", () => {
    expect(resolvePlayOptions(undefined)).toEqual({ playGain: 1, rate: 1 });
    expect(resolvePlayOptions({ fadeInMs: 10 })).toEqual({ playGain: 1, rate: 1 });
  });

  it("floors a negative gain at silence rather than inverting the signal", () => {
    expect(resolvePlayOptions({ gain: -2, rate: 1.2 })).toEqual({ playGain: 0, rate: 1.2 });
  });
});

describe("setRate", () => {
  it("lets pitch follow only a rate that was asked for", () => {
    const audio = { playbackRate: 1, preservesPitch: true } as HTMLAudioElement;
    setRate(audio, 1.1);
    expect(audio).toMatchObject({ playbackRate: 1.1, preservesPitch: false });
    setRate(audio, 1);
    expect(audio).toMatchObject({ playbackRate: 1, preservesPitch: true });
  });
});
