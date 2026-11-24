import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { useAskPrefillStore } from "@/stores/ui/askPrefill";
import { useAskPrefill } from "./useAskPrefill";

describe("useAskPrefill", () => {
  beforeEach(() => setActivePinia(createPinia()));

  // Bug caught: a screen opened by Ask came up empty, because it only looked for a request that arrived later.
  it("applies a request that was waiting before the screen mounted, once", () => {
    const apply = vi.fn();
    useAskPrefillStore().offer("complication", "reinforcements from the north");
    useAskPrefill("complication", apply);
    expect(apply).toHaveBeenCalledExactlyOnceWith("reinforcements from the north", {});
    expect(useAskPrefillStore().take("complication")).toBeNull();
  });

  // Bug caught: a screen's own choices (preset, mode) were lost between the offer and the screen.
  it("passes the offered inputs to the screen", () => {
    const apply = vi.fn();
    useAskPrefillStore().offer("complication", "x", { mode: "reinforcements" });
    useAskPrefill("complication", apply);
    expect(apply).toHaveBeenCalledExactlyOnceWith("x", { mode: "reinforcements" });
  });

  // Bug caught: asking from inside an already open screen did nothing, because only the mount was watched.
  it("applies a request offered while the screen is open", async () => {
    const apply = vi.fn();
    useAskPrefill("complication", apply);
    expect(apply).not.toHaveBeenCalled();
    useAskPrefillStore().offer("complication", "a rope bridge frays");
    await nextTick();
    expect(apply).toHaveBeenCalledExactlyOnceWith("a rope bridge frays", {});
  });

  // Bug caught: a screen took another screen's request.
  it("ignores a request for another screen", async () => {
    const apply = vi.fn();
    useAskPrefill("map_style", apply);
    useAskPrefillStore().offer("complication", "x");
    await nextTick();
    expect(apply).not.toHaveBeenCalled();
  });
});
