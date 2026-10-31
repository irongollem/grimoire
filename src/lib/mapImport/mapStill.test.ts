import { beforeEach, describe, expect, it, vi } from "vitest";

const toWebP = vi.hoisted(() => vi.fn());
vi.mock("@/lib/mediaConvert", () => ({ toWebP }));

import { MAP_STILL_MAX_PX, prepareMapStill } from "./mapStill";

describe("prepareMapStill", () => {
  beforeEach(() => toWebP.mockReset());

  // #1125 decision 6: map stills keep 4096 px where every other upload stops at 1920.
  it("re-encodes at 4096 px, not the 1920 default that would blur a map", async () => {
    const out = new File(["x"], "m.webp", { type: "image/webp" });
    toWebP.mockResolvedValue(out);
    const input = new File(["y"], "m.png", { type: "image/png" });
    expect(await prepareMapStill(input)).toBe(out);
    expect(toWebP).toHaveBeenCalledWith(input, 4096, 0.85);
    expect(MAP_STILL_MAX_PX).toBe(4096);
  });
});
