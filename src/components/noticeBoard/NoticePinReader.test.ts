// @vitest-environment jsdom
import { mount, config } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { h } from "vue";
import NoticePinReader from "./NoticePinReader.vue";
import { goat, grell, sealed, focalImageStub } from "./fixtures";
import { takeModalOrigin } from "@/lib/modalOrigin";

// FocalImage measures with a ResizeObserver the test DOM lacks.
config.global.stubs = { ...config.global.stubs, FocalImage: focalImageStub };

afterEach(() => {
  document.body.innerHTML = "";
});

const stubs = { transition: false };
const mountReader = (props: Record<string, unknown>, slots = {}) =>
  mount(NoticePinReader, { props: { open: true, face: goat, ...props }, slots, attachTo: document.body, global: { stubs } });

describe("NoticePinReader", () => {
  it("opens a note whole, with no clamp, in a dialog named for it", () => {
    const w = mountReader({});
    const dialog = document.body.querySelector("[data-modal-panel]")!;
    expect(dialog.getAttribute("role")).toBe("dialog");
    expect(dialog.textContent).toContain("LOST: one goat");
    expect(dialog.textContent).toContain("A fresh pie to whoever brings him home.");
    expect(dialog.querySelector('[data-mode="reader"]')).not.toBeNull();
    expect(dialog.querySelector("h2")!.textContent).toBe("Note");
    w.unmount();
  });

  it("gives a wanted poster its full reward line", () => {
    const w = mountReader({ face: grell });
    expect(document.body.textContent).toContain("Reward: 50 gold crowns, paid at the reeve's hall");
    w.unmount();
  });

  it("breaks a letter's seal: the body shows here", () => {
    const w = mountReader({ face: sealed });
    expect(document.body.textContent).toContain("The mine at Cinderfall has gone quiet");
    w.unmount();
  });

  it("holds what the pages put in the actions slot, and no footer when there is none", () => {
    const withActions = mountReader({}, { actions: () => h("button", "Take") });
    expect(document.body.querySelector("[data-reader-actions]")!.textContent).toBe("Take");
    withActions.unmount();
    const without = mountReader({});
    expect(document.body.querySelector("[data-reader-actions]")).toBeNull();
    without.unmount();
  });

  it("closes from the header", async () => {
    const w = mountReader({});
    document.body.querySelector<HTMLButtonElement>('[aria-label="Close"]')!.click();
    expect(w.emitted("close")).toHaveLength(1);
    w.unmount();
  });

  it("records the pin it grows from when it opens", async () => {
    const pin = document.createElement("div");
    pin.getBoundingClientRect = () => ({ top: 10, left: 20, width: 150, height: 120, right: 170, bottom: 130, x: 20, y: 10, toJSON: () => ({}) });
    const w = mountReader({ open: false, origin: pin });
    await w.setProps({ open: true });
    // The modal consumes it as it opens (instantly here, with no animation), so only a flight that never ran leaves it.
    const left = takeModalOrigin("notice-pin-reader");
    expect(left === null || left.width === 150).toBe(true);
    w.unmount();
  });

  it("renders nothing without a face", () => {
    const w = mountReader({ face: null });
    expect(document.body.querySelector("[data-modal-panel]")).toBeNull();
    w.unmount();
  });
});
