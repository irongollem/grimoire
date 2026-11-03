import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const toWebP = vi.hoisted(() => vi.fn());
const uploadWithVariants = vi.hoisted(() => vi.fn());
vi.mock("@/lib/mediaConvert", () => ({ toWebP }));
vi.mock("@/lib/storage", async (orig) => ({
  ...(await orig<typeof import("@/lib/storage")>()),
  uploadWithVariants,
  uploadToBucket: uploadWithVariants,
}));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ user: { id: "u1" } }) }));

import { useImageUpload } from "./useImageUpload";

describe("useImageUpload maxPx", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    toWebP.mockReset().mockResolvedValue(new File(["x"], "a.webp", { type: "image/webp" }));
    uploadWithVariants.mockReset().mockResolvedValue("https://cdn/x.webp");
  });

  // #1125 decision 6: a map still asks for 4096 px; every other caller keeps the 1920 default.
  it("passes the caller's long-edge limit on to the re-encode", async () => {
    await useImageUpload("location-images", { maxPx: 4096 }).upload(new File(["y"], "m.png"));
    expect(toWebP.mock.calls[0][1]).toBe(4096);
  });

  it("leaves the limit unset for callers that did not ask, so toWebP keeps its 1920 default", async () => {
    await useImageUpload("location-images").upload(new File(["y"], "m.png"));
    expect(toWebP.mock.calls[0][1]).toBeUndefined();
  });
});
