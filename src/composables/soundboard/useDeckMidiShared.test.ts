import { ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const driver = {
  support: ref("idle"),
  connect: vi.fn(async () => {
    driver.support.value = "granted";
  }),
  disconnect: vi.fn(),
};

vi.mock("@/composables/soundboard/useDeck", () => ({ useDeck: () => ({}) }));
vi.mock("@/composables/soundboard/useDeckMidi", () => ({ useDeckMidi: () => driver }));

import { MIDI_REMEMBERED_KEY, resetDeckMidiSharedForTests, useDeckMidiShared } from "./useDeckMidiShared";

function permission(state: string | "throws") {
  Object.defineProperty(navigator, "permissions", {
    configurable: true,
    value: {
      query: state === "throws" ? vi.fn().mockRejectedValue(new Error("no midi")) : vi.fn().mockResolvedValue({ state }),
    },
  });
}

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  localStorage.clear();
  resetDeckMidiSharedForTests();
  driver.support.value = "idle";
  driver.connect.mockClear();
  driver.disconnect.mockClear();
});
afterEach(() => vi.restoreAllMocks());

describe("useDeckMidiShared auto-reconnect", () => {
  it("reconnects when remembered and the permission is already granted", async () => {
    localStorage.setItem(MIDI_REMEMBERED_KEY, "1");
    permission("granted");
    useDeckMidiShared();
    await flush();
    expect(driver.connect).toHaveBeenCalledTimes(1);
  });

  it("never reconnects, and so never prompts, when the permission is not granted", async () => {
    localStorage.setItem(MIDI_REMEMBERED_KEY, "1");
    permission("prompt");
    useDeckMidiShared();
    await flush();
    expect(driver.connect).not.toHaveBeenCalled();
  });

  it("never reconnects when the browser cannot answer the permission query", async () => {
    localStorage.setItem(MIDI_REMEMBERED_KEY, "1");
    permission("throws");
    useDeckMidiShared();
    await flush();
    expect(driver.connect).not.toHaveBeenCalled();
  });

  it("never reconnects without the remembered flag even if granted", async () => {
    permission("granted");
    useDeckMidiShared();
    await flush();
    expect(driver.connect).not.toHaveBeenCalled();
  });

  it("remembers after a successful connect and forgets on disconnect", async () => {
    permission("prompt");
    const midi = useDeckMidiShared();
    await midi.connect();
    expect(localStorage.getItem(MIDI_REMEMBERED_KEY)).toBe("1");
    midi.disconnect();
    expect(localStorage.getItem(MIDI_REMEMBERED_KEY)).toBeNull();
  });

  it("does not remember a denied connect", async () => {
    permission("prompt");
    driver.connect.mockImplementationOnce(async () => {
      driver.support.value = "denied";
    });
    await useDeckMidiShared().connect();
    expect(localStorage.getItem(MIDI_REMEMBERED_KEY)).toBeNull();
  });
});
