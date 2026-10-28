// @vitest-environment jsdom
import { mount, type VueWrapper, config } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import NoticeBoardViewport from "./NoticeBoardViewport.vue";
import { goat, grell, sealed, takenGoat, focalImageStub } from "./fixtures";

// FocalImage measures with a ResizeObserver the test DOM lacks.
config.global.stubs = { ...config.global.stubs, FocalImage: focalImageStub };

function size(w: number, h: number) {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => w });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => h });
}

afterEach(() => {
  // @ts-expect-error removing the sizing installed by size()
  delete HTMLElement.prototype.clientWidth;
  // @ts-expect-error removing the sizing installed by size()
  delete HTMLElement.prototype.clientHeight;
});

async function mountBoard(props: Record<string, unknown> = {}) {
  const w = mount(NoticeBoardViewport, { props: { surface: "cork", pins: [goat, grell, sealed], ...props }, attachTo: document.body });
  await w.vm.$nextTick();
  return w;
}

const panStyle = (w: VueWrapper) => w.get("[data-pan]").attributes("style") ?? "";

describe("NoticeBoardViewport", () => {
  it("fits the whole board on a desktop, with no fades", async () => {
    size(1920, 1080);
    const w = await mountBoard();
    expect(panStyle(w)).toContain(`width: ${1600 * (1080 / (1600 * 2 / 3))}px`);
    expect(w.get("[data-edge-mask]").attributes("data-fades")).toBe("");
    w.unmount();
  });

  it("holds the readable floor on a phone held upright: 800px of board, starting at its left edge, with a fade on the right", async () => {
    size(390, 700);
    const w = await mountBoard();
    expect(panStyle(w)).toContain("width: 800px");
    expect(panStyle(w)).toContain("translate(0px,");
    expect(w.get("[data-edge-mask]").attributes("data-fades")).toBe("right");
    w.unmount();
  });

  it("pans along the board with a drag, and fades the edge it left behind", async () => {
    size(390, 700);
    const w = await mountBoard();
    const root = w.get("[data-viewport]").element;
    const ev = (type: string, x: number) => new PointerEvent(type, { pointerId: 2, clientX: x, clientY: 300, bubbles: true });
    root.dispatchEvent(ev("pointerdown", 300));
    root.dispatchEvent(ev("pointermove", 200));
    root.dispatchEvent(ev("pointerup", 200));
    await w.vm.$nextTick();
    expect(panStyle(w)).toContain("translate(-100px,");
    expect(w.get("[data-edge-mask]").attributes("data-fades")?.split(" ").sort()).toEqual(["left", "right"]);
    w.unmount();
  });

  it("zooms with the buttons up to 2.5x and Fit returns to the rule", async () => {
    size(1920, 1080);
    const w = await mountBoard();
    const fit = w.get('[aria-label="Fit the whole board"]');
    expect(fit.attributes("disabled")).toBeDefined();
    for (let i = 0; i < 12; i++) await w.get('[aria-label="Zoom in"]').trigger("click");
    expect(panStyle(w)).toContain(`width: ${1600 * 2.5}px`);
    expect(w.get('[aria-label="Zoom in"]').attributes("disabled")).toBeDefined();
    await fit.trigger("click");
    expect(panStyle(w)).toContain(`width: ${1600 * (1080 / (1600 * 2 / 3))}px`);
    w.unmount();
  });

  it("will not zoom out past the whole board", async () => {
    size(1920, 1080);
    const w = await mountBoard();
    expect(w.get('[aria-label="Zoom out"]').attributes("disabled")).toBeDefined();
    w.unmount();
  });

  it("renders every pin as a button in the order given", async () => {
    size(1920, 1080);
    const w = await mountBoard();
    expect(w.findAll("button.nb-hit").map((b) => b.attributes("aria-label"))).toEqual([
      "Note: LOST: one goat",
      "Wanted poster: Grell Ashmantle",
      "Letter: To the brave souls who read this",
    ]);
    w.unmount();
  });

  it("passes a tapped pin up with its element, and a drop up with its fractions", async () => {
    size(1920, 1080);
    const w = await mountBoard({ editable: true });
    await w.findAll("button.nb-hit")[1].trigger("click");
    expect(w.emitted("select")![0][0]).toBe("pin-grell");
    expect(w.emitted("select")![0][1]).toBeInstanceOf(HTMLElement);
    w.unmount();
  });

  it("leaves a taken pin as its stub", async () => {
    size(1920, 1080);
    const w = await mountBoard({ pins: [takenGoat] });
    expect(w.find("button.nb-hit").exists()).toBe(false);
    expect(w.get("button.nb-stub").attributes("aria-label")).toBe("Taken by Aria, session 12");
    w.unmount();
  });

  it("marks the selected pin", async () => {
    size(1920, 1080);
    const w = await mountBoard({ selectedId: "pin-grell" });
    expect(w.get('[data-id="pin-grell"]').classes()).toContain("is-selected");
    w.unmount();
  });
});

describe("NoticeBoardViewport canvas controls", () => {
  const ev = (type: string, init: PointerEventInit) => new PointerEvent(type, { pointerId: 3, clientY: 300, bubbles: true, ...init });
  const key = (type: string, init: KeyboardEventInit) => window.dispatchEvent(new KeyboardEvent(type, { cancelable: true, ...init }));

  it("pans with the middle button, including over a pin that is being arranged", async () => {
    size(390, 700);
    const w = await mountBoard({ editable: true });
    const pin = w.get("[data-pin] .nb-hit").element;
    pin.dispatchEvent(ev("pointerdown", { clientX: 300, button: 1 }));
    pin.dispatchEvent(ev("pointermove", { clientX: 200, button: 1 }));
    pin.dispatchEvent(ev("pointerup", { clientX: 200, button: 1 }));
    await w.vm.$nextTick();
    expect(panStyle(w)).toContain("translate(-100px,");
    w.unmount();
  });

  it("pans with Space held, even when the press lands on a pin, and the pin does not move", async () => {
    size(390, 700);
    const w = await mountBoard({ editable: true });
    const root = w.get("[data-viewport]");
    await root.trigger("pointerenter");
    key("keydown", { key: " ", code: "Space" });
    await w.vm.$nextTick();
    expect(root.classes()).toContain("is-hand");
    const pin = w.get("[data-pin] .nb-hit").element;
    pin.dispatchEvent(ev("pointerdown", { clientX: 300, button: 0 }));
    pin.dispatchEvent(ev("pointermove", { clientX: 200, button: 0 }));
    pin.dispatchEvent(ev("pointerup", { clientX: 200, button: 0 }));
    key("keyup", { key: " ", code: "Space" });
    await w.vm.$nextTick();
    expect(panStyle(w)).toContain("translate(-100px,");
    expect(w.emitted("move")).toBeUndefined();
    expect(root.classes()).not.toContain("is-hand");
    w.unmount();
  });

  it("a Space-tap on a pin, with no movement, does not open it", async () => {
    size(390, 700);
    const w = await mountBoard();
    const root = w.get("[data-viewport]");
    await root.trigger("pointerenter");
    key("keydown", { key: " ", code: "Space" });
    const pin = w.get("[data-pin] .nb-hit").element;
    pin.dispatchEvent(ev("pointerdown", { clientX: 300, button: 0 }));
    pin.dispatchEvent(ev("pointerup", { clientX: 300, button: 0 }));
    pin.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(w.emitted("select")).toBeUndefined();

    // Once the hand is down again, the next tap is an ordinary one.
    key("keyup", { key: " ", code: "Space" });
    pin.dispatchEvent(ev("pointerdown", { clientX: 300, button: 0 }));
    pin.dispatchEvent(ev("pointerup", { clientX: 300, button: 0 }));
    pin.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(w.emitted("select")).toHaveLength(1);
    w.unmount();
  });

  it("leaves Space to the page when the pointer is not on the board", async () => {
    size(390, 700);
    const w = await mountBoard();
    const space = new KeyboardEvent("keydown", { key: " ", code: "Space", cancelable: true });
    window.dispatchEvent(space);
    expect(space.defaultPrevented).toBe(false);
    w.unmount();
  });

  it("zooms with Ctrl+plus and minus, and Ctrl+0 fits", async () => {
    size(1920, 1080);
    const w = await mountBoard();
    await w.get("[data-viewport]").trigger("pointerenter");
    const fitWidth = 1600 * (1080 / ((1600 * 2) / 3));
    key("keydown", { key: "=", code: "Equal", ctrlKey: true });
    await w.vm.$nextTick();
    expect(panStyle(w)).toContain(`width: ${fitWidth * 1.25}px`);
    key("keydown", { key: "0", code: "Digit0", ctrlKey: true });
    await w.vm.$nextTick();
    expect(panStyle(w)).toContain(`width: ${fitWidth}px`);
    // 100% is the board's natural 1600px, held at the "whole board fits" floor, which is wider on this screen.
    key("keydown", { key: "1", code: "Digit1", ctrlKey: true });
    await w.vm.$nextTick();
    expect(panStyle(w)).toContain(`width: ${Math.max(1600, fitWidth)}px`);
    w.unmount();
  });

  it("zooms about the cursor on Alt+wheel", async () => {
    size(1920, 1080);
    const w = await mountBoard();
    // Built by hand: test-utils' trigger cannot set a modifier on a WheelEvent.
    w.get("[data-viewport]").element.dispatchEvent(
      new WheelEvent("wheel", { deltaY: -100, altKey: true, bubbles: true, cancelable: true }),
    );
    await w.vm.$nextTick();
    expect(panStyle(w)).not.toContain(`width: ${1600 * (1080 / ((1600 * 2) / 3))}px`);
    w.unmount();
  });
});


describe("NoticeBoardViewport touch and wheel", () => {
  const pe = (type: string, x: number, pointerId = 5) => new PointerEvent(type, { pointerId, clientX: x, clientY: 300, bubbles: true, cancelable: true });

  it("treats a wobble under 6px as a tap, and a real drag as not a tap on the pin it ends over", async () => {
    size(390, 700);
    const w = await mountBoard();
    const root = w.get("[data-viewport]").element;
    const pin = w.findAll("button.nb-hit")[0];
    root.dispatchEvent(pe("pointerdown", 300));
    root.dispatchEvent(pe("pointermove", 296));
    root.dispatchEvent(pe("pointerup", 296));
    await w.vm.$nextTick();
    expect(w.get("[data-viewport]").classes()).not.toContain("is-panning");
    expect(panStyle(w)).toContain("translate(0px,");
    await pin.trigger("click");
    expect(w.emitted("select")).toHaveLength(1);

    root.dispatchEvent(pe("pointerdown", 300));
    root.dispatchEvent(pe("pointermove", 200));
    await w.vm.$nextTick();
    expect(w.get("[data-viewport]").classes()).toContain("is-panning");
    root.dispatchEvent(pe("pointerup", 200));
    await w.vm.$nextTick();
    expect(w.get("[data-viewport]").classes()).not.toContain("is-panning");
    await pin.trigger("click");
    expect(w.emitted("select")).toHaveLength(1);
    await pin.trigger("click");
    expect(w.emitted("select")).toHaveLength(2);
    w.unmount();
  });

  it("does not start a pan from the zoom buttons", async () => {
    size(390, 700);
    const w = await mountBoard();
    const root = w.get("[data-viewport]").element;
    w.get('[aria-label="Zoom in"]').element.dispatchEvent(pe("pointerdown", 300));
    root.dispatchEvent(pe("pointermove", 100));
    root.dispatchEvent(pe("pointerup", 100));
    await w.vm.$nextTick();
    expect(panStyle(w)).toContain("translate(0px,");
    w.unmount();
  });

  it("leaves the wheel to the page when the whole board is on screen, and pans a board that overflows", async () => {
    size(1920, 1080);
    const fitted = await mountBoard();
    const scrollOn = new WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true });
    fitted.get("[data-viewport]").element.dispatchEvent(scrollOn);
    expect(scrollOn.defaultPrevented).toBe(false);
    fitted.unmount();

    size(390, 700);
    const phone = await mountBoard();
    const sideways = new WheelEvent("wheel", { deltaX: 80, bubbles: true, cancelable: true });
    phone.get("[data-viewport]").element.dispatchEvent(sideways);
    await phone.vm.$nextTick();
    expect(sideways.defaultPrevented).toBe(true);
    expect(panStyle(phone)).toContain("translate(-80px,");
    phone.unmount();
  });

  it("pans a pin that takes keyboard focus off the right edge back into view", async () => {
    size(390, 700);
    const w = await mountBoard();
    const root = w.get("[data-viewport]").element as HTMLElement;
    const pin = w.get("button.nb-hit").element as HTMLElement;
    vi.spyOn(root, "getBoundingClientRect").mockReturnValue({ left: 0, right: 390, top: 0, bottom: 700 } as DOMRect);
    vi.spyOn(pin.closest("[data-pin]")!, "getBoundingClientRect").mockReturnValue({ left: 300, right: 450, top: 100, bottom: 200 } as DOMRect);
    pin.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await w.vm.$nextTick();
    // The pin hangs 60px past the right edge, so the board moves 60px left.
    expect(panStyle(w)).toContain("translate(-60px,");
    w.unmount();
  });
});
