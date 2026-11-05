import { describe, it, expect } from "vitest";
import { positionNeedsPublish } from "@/composables/soundboard/useMediaSession";

// The position used to be published on every timeupdate, about four times a
// second, each one a Now Playing update over the CarPlay link. The OS runs the
// scrubber on from the last publish itself, so only a jump needs telling.
describe("positionNeedsPublish", () => {
  const last = { position: 10, duration: 180, at: 0 };

  it("publishes the first position of a track", () => {
    expect(positionNeedsPublish(null, { position: 0, duration: 180 }, 0)).toBe(true);
  });

  it("stays quiet while playback runs where the OS expects it", () => {
    // 2 s later at rate 1, steady playback sits at 12 s.
    expect(positionNeedsPublish(last, { position: 12.25, duration: 180 }, 2_000)).toBe(false);
  });

  it.each([
    ["a seek forward", 40],
    ["a seek back", 3],
    ["a stall", 10.5],
  ])("publishes after %s", (_label, position) => {
    expect(positionNeedsPublish(last, { position, duration: 180 }, 2_000)).toBe(true);
  });

  it("publishes when the track's length changes", () => {
    expect(positionNeedsPublish(last, { position: 12, duration: 200 }, 2_000)).toBe(true);
  });
});
