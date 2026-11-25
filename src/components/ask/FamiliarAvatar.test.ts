// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";

const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock("@/lib/motion", () => ({ prefersReducedMotion: () => motion.reduced }));

const { default: FamiliarAvatar } = await import("./FamiliarAvatar.vue");

function mounted(speaking: boolean) {
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  const w = mount(FamiliarAvatar, { props: { speaking } });
  return { w, play, pause };
}

describe("FamiliarAvatar", () => {
  beforeEach(() => {
    motion.reduced = false;
    vi.restoreAllMocks();
  });

  // Bug caught: the owl moving while the Familiar is quiet, or not moving when it speaks.
  it("plays while speaking and pauses when it stops", async () => {
    const { w, play, pause } = mounted(false);
    expect(play).not.toHaveBeenCalled();
    await w.setProps({ speaking: true });
    expect(play).toHaveBeenCalledTimes(1);
    await w.setProps({ speaking: false });
    expect(pause).toHaveBeenCalled();
  });

  // Bug caught (seen live): the beak left open in silence and closed while speaking, because a stop paused the loop
  // wherever it was ("an inexperienced muppeteer").
  it("rests on the closed-beak first frame, and starts speaking from it", async () => {
    const { w } = mounted(false);
    const video = w.get("video").element as HTMLVideoElement;
    await w.setProps({ speaking: true });
    video.currentTime = 1;
    await w.setProps({ speaking: false });
    expect(video.currentTime).toBe(0);
    video.currentTime = 0.6;
    await w.setProps({ speaking: true });
    expect(video.currentTime).toBe(0);
  });

  // Bug caught: motion played for someone whose device asks for reduced motion.
  it("never plays under reduced motion", async () => {
    motion.reduced = true;
    const { w, play } = mounted(false);
    await w.setProps({ speaking: true });
    expect(play).not.toHaveBeenCalled();
  });
});
