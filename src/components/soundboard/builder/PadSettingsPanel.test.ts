import { mount, flushPromises } from "@vue/test-utils";
import { ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Sound, SoundboardPadWithTakes } from "@/types/sound.types";
import PadSettingsPanel from "./PadSettingsPanel.vue";

const updatePad = vi.fn().mockResolvedValue(undefined);
const deletePad = vi.fn().mockResolvedValue(undefined);
const confirm = vi.fn();

const pad: SoundboardPadWithTakes = {
  id: "p1", campaign_id: "c", user_id: "u", page_id: "pg", lane: 0, grid_row: 0, playlist_id: null, name: null,
  launch_mode: null, loop: null, volume: 1, fade_in_ms: null, fade_out_ms: null, vary: false, velocity: false,
  repeat_ms: 500, created_at: "", updated_at: "",
  takes: [{ id: "t1", pad_id: "p1", sound_id: "s1", position: 0, created_at: "", updated_at: "" }],
};
const slam = {
  id: "s1", name: "Door slam", category: "effects", source_type: "upload", gain_trim: 1, tags: [], file_url: "x",
} as unknown as Sound;
const spotifyTake = {
  id: "s2", name: "Theme", category: "effects", source_type: "spotify", gain_trim: 1, tags: [], file_url: "spotify:track:1",
} as unknown as Sound;
const setEffect = vi.fn();

vi.mock("@/composables/soundboard/useDeckPads", () => ({
  useDeckPads: () => ({ data: ref([pad]) }),
  useUpdatePad: () => ({ mutateAsync: updatePad }),
  useDeletePad: () => ({ mutateAsync: deletePad }),
  useRemoveTake: () => ({ mutate: vi.fn() }),
  useReorderTakes: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/composables/soundboard/useSounds", () => ({
  useSounds: () => ({ data: ref([slam, spotifyTake]) }),
  useUpdateSound: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/composables/soundboard/useSoundboardPlaylists", () => ({ usePlaylists: () => ({ data: ref([]) }) }));
vi.mock("@/composables/soundboard/useSoundPlayback", () => ({
  useAudibleCheck: () => () => false,
  useSoundToggle: () => vi.fn(),
}));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm }) }));
vi.mock("@/stores/soundboard", () => ({
  useSoundboardStore: () => ({ setEffect, soundEffects: {}, directOutput: false }),
}));

const stubs = { PlaylistEditorDialog: true, SoundTrimControl: true, SoundEffectPicker: true };

function mountPanel(controls: "simple" | "full") {
  return mount(PadSettingsPanel, { props: { padId: "p1", controls }, global: { stubs } });
}

beforeEach(() => {
  vi.useFakeTimers();
  updatePad.mockClear();
  deletePad.mockClear();
  confirm.mockReset();
  setEffect.mockClear();
});
afterEach(() => vi.useRealTimers());

const button = (w: ReturnType<typeof mountPanel>, label: string) =>
  w.findAll("button").find((b) => b.text() === label);

describe("PadSettingsPanel", () => {
  it("puts an effect on every take of the pad, and none on a Spotify take", () => {
    // Bug: the effect reached only the first take (the next press played the
    // dry sound), or was sent to Spotify, which plays outside the effect chain.
    pad.takes.push({ id: "t2", pad_id: "p1", sound_id: "s2", position: 1, created_at: "", updated_at: "" },
      { id: "t3", pad_id: "p1", sound_id: "s1b", position: 2, created_at: "", updated_at: "" });
    try {
      const w = mountPanel("full");
      w.findComponent({ name: "SoundEffectPicker" }).vm.$emit("update:modelValue", "through_door");
      expect(setEffect.mock.calls).toEqual([["s1", "x", "through_door", "effects"]]);
    } finally {
      pad.takes.splice(1);
    }
  });

  it("Simple hides the Full fields", () => {
    // Bug: a beginner would see launch modes and fades they never asked for.
    const simple = mountPanel("simple");
    expect(simple.text()).not.toContain("A press");
    expect(simple.text()).not.toContain("Fade in");
    expect(mountPanel("full").text()).toContain("A press");
  });

  it("saves an emptied name as null", async () => {
    pad.name = "Slam";
    const w = mountPanel("simple");
    await w.find("input").setValue("");
    await vi.advanceTimersByTimeAsync(1000);
    await flushPromises();
    expect(updatePad).toHaveBeenCalledWith({ id: "p1", patch: { name: null } });
    pad.name = null;
  });

  it("writes the launch mode to the pad", async () => {
    const w = mountPanel("full");
    await button(w, "Gate")?.trigger("click");
    await vi.advanceTimersByTimeAsync(1000);
    await flushPromises();
    expect(updatePad).toHaveBeenCalledWith({ id: "p1", patch: { launch_mode: "gate" } });
  });

  it("does not take the pad off the deck when the confirm is cancelled", async () => {
    confirm.mockResolvedValue(false);
    const w = mountPanel("simple");
    await button(w, "Take off the deck")?.trigger("click");
    await flushPromises();
    expect(confirm).toHaveBeenCalled();
    expect(deletePad).not.toHaveBeenCalled();
    expect(w.emitted("close")).toBeUndefined();
  });

  it("takes the pad off after a confirm and closes", async () => {
    confirm.mockResolvedValue(true);
    const w = mountPanel("simple");
    await button(w, "Take off the deck")?.trigger("click");
    await flushPromises();
    expect(deletePad).toHaveBeenCalledWith("p1");
    expect(w.emitted("close")).toHaveLength(1);
  });
});
