// @vitest-environment jsdom
import { mount, config } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { h } from "vue";
import NoticePinReader from "./NoticePinReader.vue";
import { goat, grell, sealed, focalImageStub } from "./fixtures";
import { seededRotation } from "@/lib/noticeBoard/geometry";

const remembered = vi.hoisted(() => vi.fn());
vi.mock("@/lib/modalOrigin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/modalOrigin")>()),
  rememberModalOrigin: remembered,
}));

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

  it("records the pin it grows from only as it opens, not when it closes or when it has no origin", async () => {
    remembered.mockClear();
    const pin = document.createElement("div");
    pin.getBoundingClientRect = () => ({ top: 10, left: 20, width: 150, height: 120, right: 170, bottom: 130, x: 20, y: 10, toJSON: () => ({}) });
    const w = mountReader({ open: false, origin: pin });
    expect(remembered).not.toHaveBeenCalled();
    await w.setProps({ open: true });
    expect(remembered).toHaveBeenCalledTimes(1);
    expect(remembered.mock.calls[0][1]).toMatchObject({ top: 10, left: 20, width: 150, height: 120 });
    await w.setProps({ open: false });
    expect(remembered).toHaveBeenCalledTimes(1);
    w.unmount();
  });

  it("names the dialog for the notice and leans the paper half as far as it hung on the board", () => {
    const w = mountReader({});
    expect(document.body.querySelector("[data-modal-panel]")!.getAttribute("aria-label")).toBe("Note: LOST: one goat");
    const tilt = document.body.querySelector<HTMLElement>(".nb-reader-tilt")!;
    expect(tilt.style.transform).toBe(`rotate(${seededRotation("pin-goat") / 2}deg)`);
    w.unmount();
  });

  it("renders nothing without a face", () => {
    const w = mountReader({ face: null });
    expect(document.body.querySelector("[data-modal-panel]")).toBeNull();
    w.unmount();
  });
});
