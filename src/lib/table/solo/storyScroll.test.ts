import { describe, expect, it } from "vitest";
import { isAtBottom } from "./storyScroll";

describe("isAtBottom", () => {
  it("follows while the reader is at the foot, within a few pixels", () => {
    expect(isAtBottom({ scrollTop: 552, clientHeight: 400, scrollHeight: 1000 })).toBe(true);
  });

  // Bug caught: still following after the reader scrolled up to reread, so each arriving line snatches the page away.
  it("lets go once the reader has scrolled up", () => {
    expect(isAtBottom({ scrollTop: 200, clientHeight: 400, scrollHeight: 1000 })).toBe(false);
  });
});
