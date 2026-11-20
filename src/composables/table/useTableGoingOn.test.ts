import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WATCH_PAUSE_MS, useTableGoingOn } from "./useTableGoingOn";

const flags = { busy: false, speaking: false, running: false };
const listen = vi.fn().mockResolvedValue(true);

function sit() {
  let api!: ReturnType<typeof useTableGoingOn>;
  const Host = defineComponent({
    setup() {
      api = useTableGoingOn({ busy: () => flags.busy, speaking: () => flags.speaking, running: () => flags.running, listen });
      return () => h("div");
    },
  });
  const wrapper = mount(Host);
  return { api, wrapper };
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  Object.assign(flags, { busy: false, speaking: false, running: false });
  listen.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("the characters going on among themselves", () => {
  it("goes on after the pause when the characters hold the floor", () => {
    const { api } = sit();
    api.watchOn("characters");
    expect(api.goingOn.value).toBe(true);
    vi.advanceTimersByTime(WATCH_PAUSE_MS);
    expect(listen).toHaveBeenCalledTimes(1);
    expect(api.goingOn.value).toBe(false);
  });

  it("does not go on when the floor is the player's", () => {
    const { api } = sit();
    api.watchOn("player");
    vi.advanceTimersByTime(WATCH_PAUSE_MS);
    expect(listen).not.toHaveBeenCalled();
  });

  it("does not go on in a fight, over a roll, or after leaving", () => {
    flags.busy = true;
    const { api } = sit();
    api.watchOn("characters");
    expect(api.goingOn.value).toBe(false);
    vi.advanceTimersByTime(WATCH_PAUSE_MS);
    expect(listen).not.toHaveBeenCalled();
  });

  it("waits for a voice that is still reading, and goes on when it has finished", () => {
    flags.speaking = true;
    const { api } = sit();
    api.watchOn("characters");
    vi.advanceTimersByTime(WATCH_PAUSE_MS + 800);
    expect(listen).not.toHaveBeenCalled();
    flags.speaking = false;
    vi.advanceTimersByTime(400);
    expect(listen).toHaveBeenCalledTimes(1);
  });

  it("does not go on over a turn already being answered", () => {
    const { api } = sit();
    api.watchOn("characters");
    flags.running = true;
    vi.advanceTimersByTime(WATCH_PAUSE_MS);
    expect(listen).not.toHaveBeenCalled();
  });

  it("does not go on once the player has begun to write", async () => {
    const { api } = sit();
    api.watchOn("characters");
    api.writing.value = true;
    await nextTick();
    expect(api.goingOn.value).toBe(false);
    vi.advanceTimersByTime(WATCH_PAUSE_MS);
    expect(listen).not.toHaveBeenCalled();
  });

  it("does not go on over words typed in the instant before the pause ends", () => {
    const { api } = sit();
    api.watchOn("characters");
    api.writing.value = true;
    vi.advanceTimersByTime(WATCH_PAUSE_MS);
    expect(listen).not.toHaveBeenCalled();
  });

  it("does not go on once the player has stepped in", () => {
    const { api } = sit();
    api.watchOn("characters");
    api.stepIn();
    vi.advanceTimersByTime(WATCH_PAUSE_MS);
    expect(listen).not.toHaveBeenCalled();
  });

  it("stops after three turns in a row, and the player taking the floor starts the count again", () => {
    const { api } = sit();
    for (let i = 0; i < 3; i += 1) {
      api.watchOn("characters");
      vi.advanceTimersByTime(WATCH_PAUSE_MS);
    }
    expect(listen).toHaveBeenCalledTimes(3);
    api.watchOn("characters");
    expect(api.goingOn.value).toBe(false);
    api.stepIn();
    api.watchOn("characters");
    expect(api.goingOn.value).toBe(true);
  });

  it("does nothing once the page is gone", () => {
    const { api, wrapper } = sit();
    api.watchOn("characters");
    wrapper.unmount();
    vi.advanceTimersByTime(WATCH_PAUSE_MS);
    expect(listen).not.toHaveBeenCalled();
  });
});
