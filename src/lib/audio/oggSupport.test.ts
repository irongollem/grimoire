import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canPlayOggVorbis, resetOggSupportCache } from "./oggSupport";

function stubCanPlayType(answer: string) {
  const canPlayType = vi.fn(() => answer);
  vi.stubGlobal("document", { createElement: () => ({ canPlayType }) });
  return canPlayType;
}

describe("canPlayOggVorbis", () => {
  beforeEach(() => {
    resetOggSupportCache();
    vi.stubGlobal("Audio", class {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetOggSupportCache();
  });

  it("is false when the browser answers an empty string", () => {
    stubCanPlayType("");
    expect(canPlayOggVorbis()).toBe(false);
  });

  it.each(["maybe", "probably"])("is true when the browser answers %s", (answer) => {
    const canPlayType = stubCanPlayType(answer);
    expect(canPlayOggVorbis()).toBe(true);
    expect(canPlayType).toHaveBeenCalledWith('audio/ogg; codecs="vorbis"');
  });

  it("memoises the answer", () => {
    const canPlayType = stubCanPlayType("probably");
    canPlayOggVorbis();
    canPlayOggVorbis();
    expect(canPlayType).toHaveBeenCalledTimes(1);
  });

  it("does not warn when there is no document", () => {
    vi.stubGlobal("document", undefined);
    expect(canPlayOggVorbis()).toBe(true);
  });

  it("does not warn when there is no Audio", () => {
    vi.stubGlobal("Audio", undefined);
    expect(canPlayOggVorbis()).toBe(true);
  });
});
