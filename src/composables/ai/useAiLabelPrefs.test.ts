import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

const KEY = "grimoire_show_ai_labels";

async function load() {
  vi.resetModules();
  return (await import("./useAiLabelPrefs")).useAiLabelPrefs();
}

describe("useAiLabelPrefs", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("is on by default and shares one ref between callers", async () => {
    const { showAiLabels } = await load();
    expect(showAiLabels.value).toBe(true);
  });

  it("reads a saved 'false' in the existing format", async () => {
    localStorage.setItem(KEY, "false");
    expect((await load()).showAiLabels.value).toBe(false);
  });

  it("persists the choice as a bare 'false' / 'true' string", async () => {
    const { setShowAiLabels } = await load();
    setShowAiLabels(false);
    await nextTick();
    expect(localStorage.getItem(KEY)).toBe("false");
    setShowAiLabels(true);
    await nextTick();
    expect(localStorage.getItem(KEY)).toBe("true");
  });

  it("follows a change made in another tab", async () => {
    const { showAiLabels } = await load();
    localStorage.setItem(KEY, "false");
    window.dispatchEvent(new StorageEvent("storage", { key: KEY, newValue: "false", storageArea: localStorage }));
    await nextTick();
    expect(showAiLabels.value).toBe(false);
  });

  it("falls back to the default when storage access throws", async () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    const { showAiLabels, setShowAiLabels } = await load();
    expect(showAiLabels.value).toBe(true);
    expect(() => setShowAiLabels(false)).not.toThrow();
  });
});
