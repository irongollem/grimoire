import { describe, expect, it } from "vitest";
import { beakFor, meterAudio, smoothLevel } from "./audioMeter";

describe("beakFor", () => {
  // Bug caught: the beak open in a pause or shut on a loud syllable.
  it("closes in silence, half-opens on soft speech, opens on a loud syllable", () => {
    expect(beakFor(0.01, "closed")).toBe("closed");
    expect(beakFor(0.06, "closed")).toBe("half");
    expect(beakFor(0.2, "half")).toBe("open");
  });

  // Bug caught: a beak flickering open and shut on a level that hovers at a threshold.
  it("holds its step a little past the threshold it opened at", () => {
    expect(beakFor(0.1, "open")).toBe("open");
    expect(beakFor(0.1, "half")).toBe("half");
    expect(beakFor(0.03, "half")).toBe("half");
    expect(beakFor(0.03, "closed")).toBe("closed");
  });
});

describe("smoothLevel", () => {
  // Bug caught: a beak that lags behind a syllable, or snaps shut between the sounds of one word.
  it("rises quickly and falls slowly", () => {
    expect(smoothLevel(0, 1)).toBeGreaterThan(0.5);
    expect(smoothLevel(1, 0)).toBeGreaterThan(0.7);
  });
});

describe("meterAudio", () => {
  // Bug caught: a clip routed through an audio context that is not running, which silences it.
  it("leaves a clip alone when no audio context is running", () => {
    const el = { addEventListener: () => undefined } as unknown as HTMLMediaElement;
    return expect(meterAudio(el, () => undefined)).resolves.toBeNull();
  });
});
