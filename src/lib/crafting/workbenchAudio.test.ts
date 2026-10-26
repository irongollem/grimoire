import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const play = vi.fn(() => Promise.resolve());
const created: string[] = [];
vi.mock("@/lib/storage/urls", () => ({ getPublicUrl: (b: string, p: string) => `https://cdn/${b}/${p}` }));
vi.mock("@/lib/observability/sentry", () => ({ reportHandledError: vi.fn() }));

import { WORKBENCH_DISCIPLINE_SOUNDS, WORKBENCH_STINGS, WORKBENCH_WORK_SOUNDS } from "@/data/workbenchSounds";
import {
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
  created.length = 0;
  setWorkshopSoundsEnabled(true);
  vi.stubGlobal(
    "Audio",
    class {
      volume = 1;
      constructor(url: string) {
        created.push(url);
      }
      addEventListener() {}
      play = play;
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
