import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";

const broadcasting = ref(false);
const store = { isCasting: false };
vi.mock("./useSoundboardBroadcast", () => ({ useSoundboardBroadcast: () => ({ broadcasting }) }));
vi.mock("@/stores/soundboard", () => ({ useSoundboardStore: () => store }));

const { useAudioSharing } = await import("./useAudioSharing");

describe("useAudioSharing", () => {
  it("is false with neither sharing nor Cast on", () => {
    expect(useAudioSharing().value).toBe(false);
  });

  it("is true while sharing with remote players", () => {
    broadcasting.value = true;
    expect(useAudioSharing().value).toBe(true);
    broadcasting.value = false;
  });

  it("is true while casting", () => {
    store.isCasting = true;
    expect(useAudioSharing().value).toBe(true);
    store.isCasting = false;
  });
});
