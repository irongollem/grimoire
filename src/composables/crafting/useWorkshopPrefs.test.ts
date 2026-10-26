import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
vi.mock("@/lib/safeLocalStorage", () => ({
  safeLocalStorage: () => ({
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }),
}));

describe("useWorkshopPrefs", () => {
  beforeEach(() => {
    store.clear();
    vi.resetModules();
  });

  it("is on by default", async () => {
    const { useWorkshopPrefs } = await import("./useWorkshopPrefs");
    expect(useWorkshopPrefs().workshopSoundsEnabled.value).toBe(true);
  });

  it("turning it off sticks across a reload", async () => {
    const first = await import("./useWorkshopPrefs");
    first.useWorkshopPrefs().setWorkshopSounds(false);
    vi.resetModules();
    const second = await import("./useWorkshopPrefs");
    expect(second.useWorkshopPrefs().workshopSoundsEnabled.value).toBe(false);
  });
});
