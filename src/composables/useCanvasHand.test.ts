import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { useCanvasHand, type CanvasHand, type CanvasHandOptions } from "./useCanvasHand";

function setup(opts: CanvasHandOptions = {}) {
  let hand!: CanvasHand;
  const wrapper = mount(defineComponent({
    setup() {
      hand = useCanvasHand(opts);
      return () => null;
    },
  }));
  return { hand, wrapper };
}

function press(type: "keydown" | "keyup", init: KeyboardEventInit, target?: HTMLElement): KeyboardEvent {
  const ev = new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init });
  (target ?? window).dispatchEvent(ev);
  return ev;
}

const SPACE = { key: " ", code: "Space" };

describe("Space", () => {
  it("is held between keydown and keyup, and keeps the page from scrolling", () => {
    const { hand, wrapper } = setup();
    const down = press("keydown", SPACE);
    expect(hand.spaceHeld.value).toBe(true);
    expect(down.defaultPrevented).toBe(true);
    press("keyup", SPACE);
    expect(hand.spaceHeld.value).toBe(false);
    wrapper.unmount();
  });

  it("is left alone while typing and when a modifier is down", () => {
    const { hand, wrapper } = setup();
    const input = document.createElement("input");
    document.body.appendChild(input);
    expect(press("keydown", SPACE, input).defaultPrevented).toBe(false);
    expect(press("keydown", { ...SPACE, ctrlKey: true }).defaultPrevented).toBe(false);
    expect(press("keydown", { ...SPACE, metaKey: true }).defaultPrevented).toBe(false);
    expect(press("keydown", { ...SPACE, altKey: true }).defaultPrevented).toBe(false);
    expect(hand.spaceHeld.value).toBe(false);
    input.remove();
    wrapper.unmount();
  });

  it("lets go when the window loses focus", () => {
    const { hand, wrapper } = setup();
    press("keydown", SPACE);
    window.dispatchEvent(new Event("blur"));
    expect(hand.spaceHeld.value).toBe(false);
    wrapper.unmount();
  });

  it("forces a pan on the middle button, or the left button while Space is held", () => {
    const { hand, wrapper } = setup();
    expect(hand.isForcedPan({ button: 1 })).toBe(true);
    expect(hand.isForcedPan({ button: 0 })).toBe(false);
    expect(hand.isForcedPan({ button: 2 })).toBe(false);
    press("keydown", SPACE);
    expect(hand.isForcedPan({ button: 0 })).toBe(true);
    wrapper.unmount();
  });

  it("ignores keys while inactive, but still releases", () => {
    let on = true;
    const { hand, wrapper } = setup({ active: () => on });
    press("keydown", SPACE);
    on = false;
    expect(press("keydown", SPACE).defaultPrevented).toBe(false);
    press("keyup", SPACE);
    expect(hand.spaceHeld.value).toBe(false);
    wrapper.unmount();
  });
});

describe("zoom keys", () => {
  it("calls onZoom and prevents the browser's own page zoom", () => {
    const onZoom = vi.fn();
    const { wrapper } = setup({ onZoom });
    const ev = press("keydown", { key: "0", code: "Digit0", ctrlKey: true });
    expect(onZoom).toHaveBeenCalledWith("fit");
    expect(ev.defaultPrevented).toBe(true);
    wrapper.unmount();
  });

  it("leaves zoom keys alone while typing, without an onZoom, and while inactive", () => {
    const onZoom = vi.fn();
    const typing = setup({ onZoom });
    const input = document.createElement("input");
    document.body.appendChild(input);
    expect(press("keydown", { key: "0", code: "Digit0", ctrlKey: true }, input).defaultPrevented).toBe(false);
    input.remove();
    typing.wrapper.unmount();

    const none = setup();
    expect(press("keydown", { key: "0", code: "Digit0", ctrlKey: true }).defaultPrevented).toBe(false);
    none.wrapper.unmount();

    const idle = setup({ onZoom, active: () => false });
    press("keydown", { key: "0", code: "Digit0", ctrlKey: true });
    expect(onZoom).not.toHaveBeenCalled();
    idle.wrapper.unmount();
  });
});

describe("listeners", () => {
  it("are removed on unmount", () => {
    const { hand, wrapper } = setup();
    wrapper.unmount();
    press("keydown", SPACE);
    expect(hand.spaceHeld.value).toBe(false);
  });

  it("are not registered with listen: false, and the caller forwards events instead", () => {
    const { hand, wrapper } = setup({ listen: false });
    press("keydown", SPACE);
    expect(hand.spaceHeld.value).toBe(false);
    expect(hand.handleKeyDown(new KeyboardEvent("keydown", SPACE))).toBe(true);
    expect(hand.spaceHeld.value).toBe(true);
    wrapper.unmount();
  });
});
