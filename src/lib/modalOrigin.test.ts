import { afterEach, describe, expect, it, vi } from "vitest";
import { clearModalOrigin, rememberModalOrigin, takeModalOrigin } from "./modalOrigin";

const RECT = { top: 100, left: 200, width: 300, height: 150 };

afterEach(() => {
  clearModalOrigin();
  vi.useRealTimers();
});

describe("modalOrigin", () => {
  it("hands the recorded rect to the modal that was navigated to", () => {
    rememberModalOrigin("/npcs/abc", RECT);

    expect(takeModalOrigin("/npcs/abc")).toEqual(RECT);
  });

  it("gives nothing to a modal opened without a click — a deep link fades in", () => {
    expect(takeModalOrigin("/npcs/abc")).toBeNull();
  });

  it("consumes the origin, so a Back to the same modal does not replay the flight", () => {
    rememberModalOrigin("/npcs/abc", RECT);
    takeModalOrigin("/npcs/abc");

    expect(takeModalOrigin("/npcs/abc")).toBeNull();
  });

  // The whole point of keying by destination: a click on one card followed by a
  // navigation somewhere else must not leave the second modal flying out of the
  // first card.
  it("does not hand a rect to a different destination", () => {
    rememberModalOrigin("/npcs/abc", RECT);

    expect(takeModalOrigin("/monsters/xyz")).toBeNull();
  });

  it("drops a mismatched origin rather than leaving it for the next modal", () => {
    rememberModalOrigin("/npcs/abc", RECT);
    takeModalOrigin("/monsters/xyz");

    expect(takeModalOrigin("/npcs/abc")).toBeNull();
  });

  it("ignores an origin left behind by a navigation that never landed", () => {
    vi.useFakeTimers();
    rememberModalOrigin("/npcs/abc", RECT);
    vi.advanceTimersByTime(1001);

    expect(takeModalOrigin("/npcs/abc")).toBeNull();
  });

  it("keeps an origin for the duration of a normal navigation", () => {
    vi.useFakeTimers();
    rememberModalOrigin("/npcs/abc", RECT);
    vi.advanceTimersByTime(200);

    expect(takeModalOrigin("/npcs/abc")).toEqual(RECT);
  });

  it("keeps only the most recent click", () => {
    rememberModalOrigin("/npcs/abc", RECT);
    rememberModalOrigin("/npcs/def", { top: 1, left: 2, width: 3, height: 4 });

    expect(takeModalOrigin("/npcs/abc")).toBeNull();
  });
});
