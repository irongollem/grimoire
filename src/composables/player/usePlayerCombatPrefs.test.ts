import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

const KEY = "grimoire_turn_audio";

async function load() {
  vi.resetModules();
  return (await import("./usePlayerCombatPrefs")).usePlayerCombatPrefs();
}

describe("usePlayerCombatPrefs", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("is on by default and reads a saved 'false'", async () => {
    expect((await load()).turnAudioEnabled.value).toBe(true);
    localStorage.setItem(KEY, "false");
    expect((await load()).turnAudioEnabled.value).toBe(false);
  });

  it("persists the choice as a bare string", async () => {
    const { setTurnAudio } = await load();
    setTurnAudio(false);
    await nextTick();
    expect(localStorage.getItem(KEY)).toBe("false");
  });

  it("follows a change made in another tab", async () => {
    const { turnAudioEnabled } = await load();
    localStorage.setItem(KEY, "false");
    window.dispatchEvent(new StorageEvent("storage", { key: KEY, newValue: "false", storageArea: localStorage }));
    await nextTick();
    expect(turnAudioEnabled.value).toBe(false);
  });

  it("falls back to the default when storage access throws", async () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    const { turnAudioEnabled, setTurnAudio } = await load();
    expect(turnAudioEnabled.value).toBe(true);
    expect(() => setTurnAudio(false)).not.toThrow();
  });
});
