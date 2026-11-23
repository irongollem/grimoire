import { describe, expect, it } from "vitest";
import { partInView } from "./useCanonScrollSpy";

const tops = (...values: number[]) => values.map((top, i) => ({ id: `p${i}`, top }));

describe("partInView", () => {
  // Bug caught (#1255 item 32): the contents column only moved its highlight on a click, never as the page scrolled.
  it("names the last part whose heading has passed the reading line", () => {
    expect(partInView(tops(-900, -200, 60, 700), 96, false)).toBe("p2");
  });

  // Bug caught: a part whose heading is still below the line was named as soon as it appeared on screen.
  it("does not name a part that has not reached the line yet", () => {
    expect(partInView(tops(-900, -200, 97, 700), 96, false)).toBe("p1");
  });

  it("names the first part at the top of the page, before anything has passed the line", () => {
    expect(partInView(tops(120, 800), 96, false)).toBe("p0");
  });

  // Bug caught: the last part is too short to reach the line, so its highlight could never be reached by scrolling.
  it("names the last part at the end of the page", () => {
    expect(partInView(tops(-900, -200, 300), 96, true)).toBe("p2");
  });

  it("names nothing when no part is on the page", () => {
    expect(partInView([], 96, false)).toBeNull();
  });
});
