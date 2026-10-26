import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const canPlay = vi.hoisted(() => vi.fn());
vi.mock("@/lib/audio/oggSupport", () => ({ canPlayOggVorbis: canPlay }));

import AudioFormatNotice from "./AudioFormatNotice.vue";

describe("AudioFormatNotice", () => {
  beforeEach(() => canPlay.mockReset());

  it("renders nothing when Ogg Vorbis plays", () => {
    canPlay.mockReturnValue(true);
    expect(mount(AudioFormatNotice).text()).toBe("");
  });

  it("shows the update note when it does not", () => {
    canPlay.mockReturnValue(false);
    expect(mount(AudioFormatNotice).text()).toBe(
      "This device can't play the app's sound effects. On an iPhone or iPad, updating to iOS 18.4 or later fixes it.",
    );
  });
});
