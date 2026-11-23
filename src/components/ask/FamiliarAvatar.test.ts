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

  // Bug caught: motion played for someone whose device asks for reduced motion.
  it("never plays under reduced motion", async () => {
    motion.reduced = true;
    const { w, play } = mounted(false);
    await w.setProps({ speaking: true });
    expect(play).not.toHaveBeenCalled();
  });
});
