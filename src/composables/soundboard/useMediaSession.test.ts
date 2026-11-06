import { describe, it, expect } from "vitest";
import { describeBoard, positionNeedsPublish } from "@/composables/soundboard/useMediaSession";

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

// CarPlay showed the logo and a play button while a deck pad played music,
// because the session only ever described a music playlist and said "none"
// otherwise (7 Nov 2026). Unclaimed audio is a passing system sound to CarPlay.
describe("describeBoard", () => {
  const music = { bus: "music" as const, title: "Mori no Chiisana Restaurant" };
  const rain = { bus: "ambient" as const, title: "Rain on the roof" };

  it("calls a playing music pad playing, by its name", () => {
    expect(describeBoard({ loose: [music], scenes: [], pausedAll: false })).toEqual({ title: music.title, state: "playing" });
  });

  it("names the music before a scene, and a scene before any other sound", () => {
    expect(describeBoard({ loose: [rain, music], scenes: ["Tavern"], pausedAll: false })?.title).toBe(music.title);
    expect(describeBoard({ loose: [rain], scenes: ["Tavern"], pausedAll: false })?.title).toBe("Tavern");
  });

  it("still claims the audio when the sound has no name", () => {
    expect(describeBoard({ loose: [{ bus: "effects", title: undefined }], scenes: [], pausedAll: false })).toEqual({ title: "Dungeon Grimoire", state: "playing" });
  });

  it("says paused, not stopped, after Pause all, so play on the car resumes", () => {
    expect(describeBoard({ loose: [], scenes: [], pausedAll: true })?.state).toBe("paused");
  });

  it("lets go of the session when nothing plays or waits", () => {
    expect(describeBoard({ loose: [], scenes: [], pausedAll: false })).toBeNull();
  });
});
