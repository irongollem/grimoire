import { describe, expect, it } from "vitest";
import { hasSourceCue, markSourcesSeen } from "./useSourceCue";

const available = [{ source: "srd-2014" }, { source: "homebrew" }];

describe("hasSourceCue", () => {
  it("shows no dot when every source is enabled", () => {
    expect(hasSourceCue(available, new Set(["srd-2014", "homebrew"]), [])).toBe(false);
  });
  it("shows a dot for an unenabled source not yet seen", () => {
    expect(hasSourceCue(available, new Set(["srd-2014"]), [])).toBe(true);
  });
  it("clears once the picker has been opened", () => {
    const seen = markSourcesSeen(available, []);
    expect(hasSourceCue(available, new Set(["srd-2014"]), seen)).toBe(false);
  });
  it("returns when a new source appears", () => {
    const seen = markSourcesSeen(available, []);
    const later = [...available, { source: "new-set" }];
    expect(hasSourceCue(later, new Set(["srd-2014"]), seen)).toBe(true);
  });
  it("does not cue for an enabled source that was never seen", () => {
    expect(hasSourceCue([{ source: "a" }], new Set(["a"]), undefined)).toBe(false);
  });
  it("shows nothing while the list is loading", () => {
    expect(hasSourceCue(undefined, new Set(), undefined)).toBe(false);
  });
  it("shows nothing while the enabled sources are loading", () => {
    expect(hasSourceCue(available, null, undefined)).toBe(false);
  });
});
