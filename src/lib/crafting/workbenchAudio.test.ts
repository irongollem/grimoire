import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const play = vi.fn(() => Promise.resolve());
const created: string[] = [];
const volumes: number[] = [];
vi.mock("@/lib/storage/urls", () => ({ getPublicUrl: (b: string, p: string) => `https://cdn/${b}/${p}` }));
vi.mock("@/lib/observability/sentry", () => ({ reportHandledError: vi.fn() }));
const canPlayOgg = vi.fn(() => true);
vi.mock("@/lib/audio/oggSupport", () => ({ canPlayOggVorbis: () => canPlayOgg() }));

import { safeLocalStorage } from "@/lib/safeLocalStorage";
import { WORKBENCH_DISCIPLINE_SOUNDS, WORKBENCH_STINGS, WORKBENCH_WORK_SOUNDS } from "@/data/workbenchSounds";
import {
  getWorkshopSoundsEnabled,
  playOutcomeSting,
  playWorkSound,
  setWorkshopSoundsEnabled,
  stingForOutcome,
  workSoundFor,
} from "./workbenchAudio";

// The data module is mutated per test; put back exactly what it held.
const realForge = { ...WORKBENCH_WORK_SOUNDS["ws-forge"] };
const realSuccess = { ...WORKBENCH_STINGS.success };

beforeEach(() => {
  play.mockClear();
  canPlayOgg.mockReturnValue(true);
  created.length = 0;
  volumes.length = 0;
  setWorkshopSoundsEnabled(true);
  vi.stubGlobal(
    "Audio",
    class {
      volume = 1;
      constructor(url: string) {
        created.push(url);
      }
      play = () => {
        volumes.push(this.volume);
        return play();
      };
    },
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  WORKBENCH_WORK_SOUNDS["ws-forge"] = { ...realForge };
  WORKBENCH_STINGS.success = { ...realSuccess };
});

describe("workbenchAudio", () => {
  it("plays nothing for a sound with no slug", () => {
    WORKBENCH_WORK_SOUNDS["ws-forge"] = { slug: null };
    WORKBENCH_STINGS.success = { slug: null };
    playWorkSound("smithing");
    playOutcomeSting("success");
    expect(play).not.toHaveBeenCalled();
  });

  it("plays nothing when the preference is off", () => {
    WORKBENCH_STINGS.success = { slug: "chime" };
    setWorkshopSoundsEnabled(false);
    playOutcomeSting("success");
    expect(play).not.toHaveBeenCalled();
  });

  it("plays nothing on a device that cannot decode Ogg", () => {
    WORKBENCH_STINGS.success = { slug: "chime" };
    canPlayOgg.mockReturnValue(false);
    playOutcomeSting("success");
    expect(play).not.toHaveBeenCalled();
  });

  it("does not report a play blocked by autoplay rules", async () => {
    const { reportHandledError } = await import("@/lib/observability/sentry");
    vi.mocked(reportHandledError).mockClear();
    play.mockImplementationOnce(() => Promise.reject(new DOMException("blocked", "NotAllowedError")));
    WORKBENCH_STINGS.success = { slug: "chime" };
    playOutcomeSting("success");
    await Promise.resolve();
    await Promise.resolve();
    expect(reportHandledError).not.toHaveBeenCalled();
  });

  it("reports a play that failed for a real reason, and a blocked one that is not a DOMException", async () => {
    const { reportHandledError } = await import("@/lib/observability/sentry");
    vi.mocked(reportHandledError).mockClear();
    WORKBENCH_STINGS.success = { slug: "chime" };
    play.mockImplementationOnce(() => Promise.reject(new DOMException("no source", "NotSupportedError")));
    play.mockImplementationOnce(() => Promise.reject(Object.assign(new Error("blocked"), { name: "NotAllowedError" })));
    playOutcomeSting("success");
    playOutcomeSting("success");
    await vi.waitFor(() => expect(reportHandledError).toHaveBeenCalledTimes(2));
  });

  it("treats a cut-short play as ordinary, not a fault", async () => {
    const { reportHandledError } = await import("@/lib/observability/sentry");
    vi.mocked(reportHandledError).mockClear();
    play.mockImplementationOnce(() => Promise.reject(new DOMException("interrupted", "AbortError")));
    WORKBENCH_STINGS.success = { slug: "chime" };
    playOutcomeSting("success");
    await Promise.resolve();
    await Promise.resolve();
    expect(reportHandledError).not.toHaveBeenCalled();
  });

  it("sounds are on until the player turns them off", () => {
    safeLocalStorage().removeItem("grimoire_workshop_sounds");
    expect(getWorkshopSoundsEnabled()).toBe(true);
    setWorkshopSoundsEnabled(false);
    expect(getWorkshopSoundsEnabled()).toBe(false);
  });

  it("plays at full volume by default and keeps a sound's gain inside 0 to 1", () => {
    WORKBENCH_STINGS.success = { slug: "chime" };
    playOutcomeSting("success");
    WORKBENCH_STINGS.success = { slug: "chime", gain: 0.4 };
    playOutcomeSting("success");
    WORKBENCH_STINGS.success = { slug: "chime", gain: 3 };
    playOutcomeSting("success");
    WORKBENCH_STINGS.success = { slug: "chime", gain: -1 };
    playOutcomeSting("success");
    expect(volumes).toEqual([1, 0.4, 1, 0]);
  });

  it("spaces a repeated hit by its gap, 400 ms when none is given, and plays once by default", () => {
    vi.useFakeTimers();
    WORKBENCH_WORK_SOUNDS["ws-forge"] = { slug: "anvil", repeat: 3, gapMs: 100 };
    playWorkSound("smithing");
    expect(created).toHaveLength(1);
    vi.advanceTimersByTime(150);
    expect(created).toHaveLength(2);
    vi.advanceTimersByTime(100);
    expect(created).toHaveLength(3);

    created.length = 0;
    WORKBENCH_WORK_SOUNDS["ws-forge"] = { slug: "anvil", repeat: 2 };
    playWorkSound("smithing");
    vi.advanceTimersByTime(399);
    expect(created).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(created).toHaveLength(2);

    created.length = 0;
    WORKBENCH_WORK_SOUNDS["ws-forge"] = { slug: "anvil" };
    playWorkSound("smithing");
    vi.advanceTimersByTime(5000);
    expect(created).toHaveLength(1);
  });

  it("plays the library file and repeats a short hit", () => {
    vi.useFakeTimers();
    WORKBENCH_WORK_SOUNDS["ws-forge"] = { slug: "anvil", repeat: 3, gapMs: 100 };
    playWorkSound("smithing");
    vi.advanceTimersByTime(250);
    expect(created).toEqual(Array(3).fill("https://cdn/sounds/library/anvil.ogg"));
  });

  it("maps outcomes to stings", () => {
    expect(stingForOutcome("success")).toBe("success");
    expect(stingForOutcome("fail")).toBe("failure");
    expect(stingForOutcome("ruin")).toBe("critical");
  });

  it("resolves painting to its own sound and scribing to the desk's", () => {
    expect(workSoundFor("painting")).toBe(WORKBENCH_DISCIPLINE_SOUNDS.painting);
    expect(workSoundFor("scribing")).toBe(WORKBENCH_WORK_SOUNDS["ws-desk"]);
    expect(workSoundFor("forgery")).toBe(WORKBENCH_WORK_SOUNDS["ws-desk"]);
  });
});
