// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick, ref } from "vue";
import { useStudioClock } from "./useStudioClock";

function mountClock(loop = ref(12)) {
  let out!: ReturnType<typeof useStudioClock>;
  createApp(defineComponent({ setup() { out = useStudioClock(loop); return () => h("div"); } })).mount(document.createElement("div"));
  return { clock: out, loop };
}

describe("useStudioClock", () => {
  it("wraps a seek into the loop", () => {
    const { clock } = mountClock();
    clock.seek(13.5);
    expect(clock.t.value).toBeCloseTo(1.5);
    clock.seek(-1);
    expect(clock.t.value).toBeCloseTo(11);
  });

  it("pulls the playhead back inside a loop made shorter", async () => {
    // Bug: a playhead at 20 s on an 8 s loop draws no frame the loop contains.
    const { clock, loop } = mountClock();
    clock.seek(10);
    loop.value = 8;
    await nextTick();
    expect(clock.t.value).toBeCloseTo(2);
  });

  it("is held by every hold, and runs again only when each has been released", () => {
    // Bug: one drag ending would free a playhead another hold (a second pointer) still needs still.
    const { clock } = mountClock();
    clock.playing.value = true;
    expect(clock.running.value).toBe(true);
    clock.hold();
    clock.hold();
    clock.release();
    expect(clock.running.value).toBe(false);
    clock.release();
    expect(clock.running.value).toBe(true);
    clock.release();
    clock.hold();
    expect(clock.running.value).toBe(false);
  });

  it("does not run while paused", () => {
    const { clock } = mountClock();
    clock.playing.value = false;
    expect(clock.running.value).toBe(false);
  });
});
