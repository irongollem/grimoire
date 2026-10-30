// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref, withDirectives } from "vue";
import { mount } from "@vue/test-utils";
import { vRollMode, type RollModeBinding } from "./vRollMode";
import type { RollMode } from "@/lib/dice/roller";

const picker = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock("@/composables/dice/useRollModePicker", () => ({ openRollModePicker: picker.open }));

function mountTrigger(enabled: ReturnType<typeof ref<boolean>>) {
  return mount(
    defineComponent({
      setup: () => () =>
        withDirectives(h("div", "Acrobatics"), [
          [vRollMode, { enabled: enabled.value, on: () => {} } satisfies RollModeBinding],
        ]),
    }),
  );
}

describe("v-roll-mode", () => {
  // The long-press opens the picker; iOS must not also select the text (#1078).
  it("keeps the OS text selection off a trigger whose picker is enabled", async () => {
    const enabled = ref(true);
    const wrapper = mountTrigger(enabled);
    expect(wrapper.element.style.userSelect).toBe("none");

    enabled.value = false;
    await nextTick();
    expect(wrapper.element.style.userSelect).toBe("");
  });
});

describe("v-roll-mode handler freshness", () => {
  // Chicory's Mace rolled +4 under a +3 label: the row mounted before its item
  // loaded, and the click still ran the handler from that first render.
  it("calls the handler from the latest render, not the one it mounted with", async () => {
    const who = ref("first");
    const seen: string[] = [];
    const wrapper = mount(
      defineComponent({
        setup: () => () => {
          const label = who.value;
          return withDirectives(h("div", "Attack"), [[vRollMode, () => seen.push(label)]]);
        },
      }),
    );
    who.value = "second";
    await nextTick();
    wrapper.element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(seen).toEqual(["second"]);
  });
});

describe("v-roll-mode gestures", () => {
  const calls: Array<RollMode | null> = [];
  function mountRoller(enabled = true) {
    return mount(
      defineComponent({
        setup: () => () =>
          withDirectives(h("div", "Acrobatics"), [[vRollMode, { enabled, on: (mode) => calls.push(mode) } satisfies RollModeBinding]]),
      }),
    );
  }
  const touch = (type: string, x: number, y: number) => {
    const ev = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(ev, "touches", { value: [{ clientX: x, clientY: y }] });
    return ev;
  };

  beforeEach(() => {
    calls.length = 0;
    picker.open.mockReset();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it("rolls as normal on a plain click", () => {
    const w = mountRoller();
    w.element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(calls).toEqual([null]);
  });

  it("opens the picker on a right-click and rolls with the mode chosen, nothing if it is dismissed", async () => {
    picker.open.mockResolvedValueOnce("advantage").mockResolvedValueOnce(null);
    const w = mountRoller();
    const menu = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 5, clientY: 6 });
    w.element.dispatchEvent(menu);
    await vi.advanceTimersByTimeAsync(0);
    expect(menu.defaultPrevented).toBe(true);
    expect(picker.open).toHaveBeenCalledWith(5, 6);
    expect(calls).toEqual(["advantage"]);
    w.element.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toEqual(["advantage"]);
  });

  it("leaves the browser's own menu alone when the picker is switched off", () => {
    const w = mountRoller(false);
    const menu = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    w.element.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(false);
    expect(picker.open).not.toHaveBeenCalled();
  });

  it("opens the picker after a 450 ms press, swallows the click that follows, and not before the time is up", async () => {
    picker.open.mockResolvedValue("disadvantage");
    const w = mountRoller();
    w.element.dispatchEvent(touch("touchstart", 10, 10));
    await vi.advanceTimersByTimeAsync(449);
    expect(picker.open).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(picker.open).toHaveBeenCalledWith(10, 10);
    expect(calls).toEqual(["disadvantage"]);
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    w.element.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(calls).toEqual(["disadvantage"]);
  });

  it("keeps the press for a wobble of up to 10 px in each direction, and cancels it past that on either axis", async () => {
    const w = mountRoller();
    w.element.dispatchEvent(touch("touchstart", 10, 10));
    w.element.dispatchEvent(touch("touchmove", 20, 20));
    await vi.advanceTimersByTimeAsync(450);
    expect(picker.open).toHaveBeenCalledTimes(1);
    for (const [x, y] of [[21, 10], [10, 21]]) {
      picker.open.mockClear();
      w.element.dispatchEvent(touch("touchstart", 10, 10));
      w.element.dispatchEvent(touch("touchmove", x, y));
      await vi.advanceTimersByTimeAsync(450);
      expect(picker.open).not.toHaveBeenCalled();
    }
  });

  it("cancels the press when the finger lifts early", async () => {
    const w = mountRoller();
    w.element.dispatchEvent(touch("touchstart", 10, 10));
    w.element.dispatchEvent(new Event("touchend"));
    await vi.advanceTimersByTimeAsync(450);
    expect(picker.open).not.toHaveBeenCalled();
  });

  it("stops listening once unmounted", () => {
    const w = mountRoller();
    const el = w.element;
    w.unmount();
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(calls).toEqual([]);
  });
});
