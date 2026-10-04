import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { useCampaignStore } from "@/stores/campaign";
import { useRetainedGeneration } from "./useRetainedGeneration";

describe("useRetainedGeneration", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useCampaignStore().activeCampaignId = "camp-a";
  });

  it("keeps the result when the save fails, and clears it when a retry succeeds", async () => {
    const r = useRetainedGeneration<{ name: string }>();
    const persist = vi.fn<(x: { name: string }) => Promise<{ id: string } | null>>();
    persist.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "1" });

    expect(await r.run({ name: "Odin" }, persist)).toBeNull();
    expect(r.unsaved.value).toEqual({ name: "Odin" });
    expect(r.isSaving.value).toBe(false);

    // The retry saves the retained value; nothing is regenerated.
    expect(await r.run(r.unsaved.value!, persist)).toEqual({ id: "1" });
    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist).toHaveBeenLastCalledWith({ name: "Odin" });
    expect(r.unsaved.value).toBeNull();
  });

  it("is saving while persist runs, even if it throws", async () => {
    const r = useRetainedGeneration<string>();
    let seen = false;
    await expect(
      r.run("x", async () => {
        seen = r.isSaving.value;
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(seen).toBe(true);
    expect(r.isSaving.value).toBe(false);
  });

  it("clear() discards the retained result", async () => {
    const r = useRetainedGeneration<string>();
    await r.run("x", async () => null);
    expect(r.unsaved.value).toBe("x");
    r.clear();
    expect(r.unsaved.value).toBeNull();
  });

  it("drops a retained result when the active campaign changes", async () => {
    const r = useRetainedGeneration<string>();
    const persist = vi.fn(async () => null);
    await r.run("for-a", persist);
    expect(r.unsaved.value).toBe("for-a");

    useCampaignStore().activeCampaignId = "camp-b";
    await nextTick();
    expect(r.unsaved.value).toBeNull();
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("does not retain a failed result when the campaign changed mid-save", async () => {
    const r = useRetainedGeneration<string>();
    await r.run("x", async () => {
      useCampaignStore().activeCampaignId = "camp-b";
      return null;
    });
    expect(r.unsaved.value).toBeNull();
  });
});
