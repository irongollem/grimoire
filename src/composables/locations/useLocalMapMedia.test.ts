import { beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, ref } from "vue";

const media = vi.hoisted(() => ({
  files: new Map<string, File>(),
  saved: true,
  // A key listed here answers only when its resolver is called, so a test can make one read finish late.
  held: new Map<string, () => void>(),
}));
vi.mock("@/lib/mapImport/localMedia", () => ({
  getLocalMap: (key: string) =>
    new Promise<File | null>((resolve) => {
      if (key === "slow") media.held.set(key, () => resolve(media.files.get(key) ?? null));
      else resolve(media.files.get(key) ?? null);
    }),
  saveLocalMap: (key: string, file: File) => {
    if (media.saved) media.files.set(key, file);
    return Promise.resolve(media.saved);
  },
}));

import { useLocalMapMedia } from "./useLocalMapMedia";

const created: string[] = [];
const revoked: string[] = [];
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
  await nextTick();
};

beforeEach(() => {
  media.files.clear();
  media.saved = true;
  media.held.clear();
  created.length = 0;
  revoked.length = 0;
  URL.createObjectURL = () => {
    const u = `blob:${created.length}`;
    created.push(u);
    return u;
  };
  URL.revokeObjectURL = (u: string) => {
    revoked.push(u);
  };
});

describe("useLocalMapMedia", () => {
  it("has no file on this device: missing, so the DM is offered a pick", async () => {
    const scope = effectScope();
    const m = scope.run(() => useLocalMapMedia("loc-1"))!;
    await flush();
    expect(m.url.value).toBeNull();
    expect(m.missing.value).toBe(true);
    scope.stop();
  });

  it("a place that is not moving (null key) is neither playing nor missing", async () => {
    const scope = effectScope();
    const m = scope.run(() => useLocalMapMedia(null))!;
    await flush();
    expect(m.url.value).toBeNull();
    expect(m.missing.value).toBe(false);
    scope.stop();
  });

  it("revokes the object URL when the key changes and when the scope ends (no leaked blob)", async () => {
    media.files.set("a", new File(["x"], "a.mp4"));
    media.files.set("b", new File(["y"], "b.mp4"));
    const key = ref("a");
    const scope = effectScope();
    const m = scope.run(() => useLocalMapMedia(key))!;
    await flush();
    expect(m.url.value).toBe("blob:0");
    key.value = "b";
    await flush();
    expect(revoked).toEqual(["blob:0"]);
    expect(m.url.value).toBe("blob:1");
    scope.stop();
    expect(revoked).toEqual(["blob:0", "blob:1"]);
  });

  it("a slow read for the old key never overwrites the new key's file", async () => {
    media.files.set("slow", new File(["x"], "slow.mp4"));
    media.files.set("b", new File(["y"], "b.mp4"));
    const key = ref("slow");
    const scope = effectScope();
    const m = scope.run(() => useLocalMapMedia(key))!;
    await flush();
    key.value = "b";
    await flush();
    expect(m.url.value).toBe("blob:0");
    media.held.get("slow")!();
    await flush();
    // Still the second key's URL: the late answer for "slow" was dropped.
    expect(m.url.value).toBe("blob:0");
    expect(created).toHaveLength(1);
    scope.stop();
  });

  it("picking the file saves it and starts playing; a different file only warns", async () => {
    const scope = effectScope();
    const m = scope.run(() => useLocalMapMedia("loc-1", { fileName: "river.mp4", bytes: 4 }))!;
    await flush();
    await m.pick(new File(["abcd"], "river.mp4"));
    expect(m.missing.value).toBe(false);
    expect(m.url.value).not.toBeNull();
    expect(m.mismatch.value).toBe(false);
    await m.pick(new File(["abcdef"], "other.mp4"));
    expect(m.url.value).not.toBeNull();
    expect(m.mismatch.value).toBe(true);
    scope.stop();
  });

  it("a pick the browser could not store leaves the map missing", async () => {
    media.saved = false;
    const scope = effectScope();
    const m = scope.run(() => useLocalMapMedia("loc-1"))!;
    await flush();
    await m.pick(new File(["abcd"], "river.mp4"));
    expect(m.url.value).toBeNull();
    expect(m.missing.value).toBe(true);
    scope.stop();
  });
});
