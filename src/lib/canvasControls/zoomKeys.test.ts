import { describe, it, expect } from "vitest";
import { resolveZoomKey, type ZoomKeyEvent } from "./zoomKeys";

const ev = (over: Partial<ZoomKeyEvent>): ZoomKeyEvent => ({
  key: "a", code: "KeyA", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...over,
});

describe("resolveZoomKey", () => {
  it("Ctrl/Cmd with + or = zooms in, including the numpad", () => {
    expect(resolveZoomKey(ev({ key: "+", code: "Equal", ctrlKey: true, shiftKey: true }))).toBe("in");
    expect(resolveZoomKey(ev({ key: "=", code: "Equal", metaKey: true }))).toBe("in");
    expect(resolveZoomKey(ev({ key: "+", code: "NumpadAdd", ctrlKey: true }))).toBe("in");
  });

  it("Ctrl/Cmd with - zooms out, including the numpad", () => {
    expect(resolveZoomKey(ev({ key: "-", code: "Minus", ctrlKey: true }))).toBe("out");
    expect(resolveZoomKey(ev({ key: "-", code: "NumpadSubtract", metaKey: true }))).toBe("out");
  });

  it("Ctrl/Cmd+0 fits and Ctrl/Cmd+1 shows 100%", () => {
    expect(resolveZoomKey(ev({ key: "0", code: "Digit0", ctrlKey: true }))).toBe("fit");
    expect(resolveZoomKey(ev({ key: "0", code: "Numpad0", metaKey: true }))).toBe("fit");
    expect(resolveZoomKey(ev({ key: "1", code: "Digit1", ctrlKey: true }))).toBe("actual");
    expect(resolveZoomKey(ev({ key: "1", code: "Numpad1", metaKey: true }))).toBe("actual");
  });

  it("Figma's Shift+1 fits and Shift+0 shows 100%, read by physical key", () => {
    expect(resolveZoomKey(ev({ key: "!", code: "Digit1", shiftKey: true }))).toBe("fit");
    expect(resolveZoomKey(ev({ key: ")", code: "Digit0", shiftKey: true }))).toBe("actual");
    expect(resolveZoomKey(ev({ key: "1", code: "Numpad1", shiftKey: true }))).toBe("fit");
  });

  it("reads the physical key when the layout types something else for the digit or the plus", () => {
    // AZERTY: the digit row types "&" and "à" unshifted, and a German keyboard's "=" key can type "´".
    expect(resolveZoomKey(ev({ key: "&", code: "Digit1", ctrlKey: true }))).toBe("actual");
    expect(resolveZoomKey(ev({ key: "à", code: "Digit0", metaKey: true }))).toBe("fit");
    expect(resolveZoomKey(ev({ key: "´", code: "Equal", ctrlKey: true }))).toBe("in");
  });

  it("plain digits, Alt combos and Ctrl+Shift digits are not zoom shortcuts", () => {
    expect(resolveZoomKey(ev({ key: "1", code: "Digit1" }))).toBeNull();
    expect(resolveZoomKey(ev({ key: "0", code: "Digit0", ctrlKey: true, altKey: true }))).toBeNull();
    expect(resolveZoomKey(ev({ key: "0", code: "Digit0", ctrlKey: true, shiftKey: true }))).toBeNull();
    expect(resolveZoomKey(ev({ key: "z", code: "KeyZ", ctrlKey: true }))).toBeNull();
  });
});
