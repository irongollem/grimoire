import { beforeEach, describe, expect, it } from "vitest";
import { effectScope, nextTick, ref } from "vue";
import { hasSourceCue, markSourcesSeen, useSourceCue } from "./useSourceCue";

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

describe("markSourcesSeen", () => {
  it("keeps what was seen before even when it is no longer listed, without duplicating", () => {
    expect(markSourcesSeen([{ source: "b" }, { source: "a" }], ["a", "gone"]).sort()).toEqual(["a", "b", "gone"]);
  });
});

describe("useSourceCue", () => {
  beforeEach(() => localStorage.clear());

  function cue(key: string | undefined, listed: { source: string }[] | undefined) {
    const available = ref(listed);
    return effectScope().run(() => useSourceCue(() => key, available, () => new Set(["srd-2014"])))!;
  }

  it("clears the dot for the picker that was opened, not for another picker", async () => {
    const monsters = cue("monsters", [{ source: "homebrew" }]);
    const spells = cue("spells", [{ source: "homebrew" }]);
    expect(monsters.hasCue.value).toBe(true);
    monsters.markSeen();
    await nextTick();
    expect(monsters.hasCue.value).toBe(false);
    expect(spells.hasCue.value).toBe(true);
  });

  it("opening the picker while its list is still loading marks nothing seen", async () => {
    cue("monsters", []).markSeen();
    const later = cue("monsters", [{ source: "homebrew" }]);
    await nextTick();
    expect(later.hasCue.value).toBe(true);
  });

  it("has no dot, and records nothing, for a picker without a cue key", async () => {
    const anonymous = cue(undefined, [{ source: "homebrew" }]);
    anonymous.markSeen();
    expect(anonymous.hasCue.value).toBe(false);
    expect(JSON.parse(localStorage.getItem("library-source-cue-seen") ?? "{}")).toEqual({});
  });
});
