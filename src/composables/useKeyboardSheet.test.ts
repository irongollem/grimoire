import { describe, expect, it } from "vitest";
import { keyboardInsets, type ViewportReading } from "./useKeyboardSheet";

// An iPhone 15 upright: 393 x 852 CSS px, keyboard with its bar about 336 px.
const page: ViewportReading = { layoutWidth: 393, layoutHeight: 852, height: 852, offsetTop: 0, scale: 1 };

describe("keyboardInsets", () => {
  // Bug caught: the sheet pinned to the layout viewport while iOS has scrolled it, so its head is off screen and the
  // bottom bar shows between the text box and the keyboard (the screenshot of 25 Nov 2026).
  it("places the visible area inside a page iOS scrolled up by the keyboard's height", () => {
    // 852 - 336 = 516 visible; scrolled to the foot, so the top 336 px are off screen and nothing is covered below.
    expect(keyboardInsets({ ...page, height: 516, offsetTop: 336 }, 852)).toEqual({ open: true, top: 336, bottom: 0 });
  });

  it("gives the keyboard's cover as the bottom inset when the page has not scrolled", () => {
    expect(keyboardInsets({ ...page, height: 516 }, 852)).toEqual({ open: true, top: 0, bottom: 336 });
  });

  // Bug caught: Safari's toolbar sliding in (about 50 to 100 px) read as a keyboard, so the sheet jumps to full height on a scroll.
  it.each([
    [119, false],
    [120, true],
  ])("counts %i px lost as a keyboard: %s", (lost, open) => {
    expect(keyboardInsets({ ...page, height: 852 - lost }, 852).open).toBe(open);
  });

  // Bug caught: a pinch-zoomed page (visual viewport half the height) read as a keyboard.
  it("is not a keyboard while the page is pinched in", () => {
    expect(keyboardInsets({ ...page, height: 426, scale: 2 }, 852).open).toBe(false);
  });

  // Bug caught: where the browser shrinks the page itself, page and visible area agree, and the bottom bar stays above the keyboard.
  it("knows a keyboard is up where the page itself was shrunk, from the tallest page seen", () => {
    expect(keyboardInsets({ ...page, layoutHeight: 516, height: 516 }, 852)).toEqual({ open: true, top: 0, bottom: 0 });
  });
});
