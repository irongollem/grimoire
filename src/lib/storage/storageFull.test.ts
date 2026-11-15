import { describe, it, expect, vi } from "vitest";
import { notifyStorageFull, onStorageFull, storageFullKind } from "./storageFull";

describe("storageFullKind", () => {
  it("calls a set with one non-image in it files, so a model upload is not blamed on pictures", () => {
    expect(storageFullKind(["image/webp", "model/gltf-binary"])).toBe("files");
  });

  it("calls an all-image set pictures", () => {
    expect(storageFullKind(["image/webp", "image/jpeg"])).toBe("pictures");
  });
});

describe("onStorageFull", () => {
  it("stops delivering once unsubscribed, so an unmounted app does not toast", () => {
    const listener = vi.fn();
    const off = onStorageFull(listener);
    notifyStorageFull("pictures");
    off();
    notifyStorageFull("files");
    expect(listener.mock.calls).toEqual([["pictures"]]);
  });
});
