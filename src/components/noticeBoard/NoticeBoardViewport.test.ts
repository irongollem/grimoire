// @vitest-environment jsdom
import { mount, type VueWrapper, config } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
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

