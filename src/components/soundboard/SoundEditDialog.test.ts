import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Sound } from "@/types/sound.types";
import SoundEditDialog from "./SoundEditDialog.vue";

const updateSound = vi.fn().mockResolvedValue(undefined);
const deleteSound = vi.fn().mockResolvedValue(undefined);
const confirm = vi.fn();
const stop = vi.fn();

vi.mock("@/composables/soundboard/useSounds", () => ({
  useUpdateSound: () => ({ mutateAsync: updateSound }),
  useDeleteSound: () => ({ mutateAsync: deleteSound }),
}));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm }) }));
vi.mock("@/stores/soundboard", () => ({ useSoundboardStore: () => ({ stop }) }));

const tavern = {
  id: "s1", name: "Tavern song", category: "ambient", source_type: "upload", artist: null, thumbnail_url: null,
  attribution: null, gain_trim: 1, tags: [], file_url: "x",
} as unknown as Sound;

const stubs = {
  AppModal: { template: "<div><slot /></div>" },
  ModalHeader: { template: "<div><slot name='actions' /></div>" },
  ImageUpload: true,
  SoundTrimControl: true,
};

function mountDialog() {
  return mount(SoundEditDialog, { props: { sound: tavern }, global: { stubs } });
}

const button = (w: ReturnType<typeof mountDialog>, label: string) =>
  w.findAll("button").find((b) => b.text() === label);

beforeEach(() => {
  vi.useFakeTimers();
  updateSound.mockClear();
  deleteSound.mockClear();
  confirm.mockReset();
  stop.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("SoundEditDialog", () => {
  it("renames the sound and moves it to another kind", async () => {
    // Bug: after the deck redesign nothing in the library could write a sound's name or category.
    const w = mountDialog();
    await w.findAll("input")[0]?.setValue("  Tavern ballad ");
    await button(w, "Music track")?.trigger("click");
    await vi.advanceTimersByTimeAsync(1000);
    await flushPromises();
    expect(updateSound).toHaveBeenLastCalledWith({
      id: "s1",
      update: { name: "Tavern ballad", artist: null, category: "music" },
    });
  });

  it("does not save a blank name", async () => {
    const w = mountDialog();
    await w.findAll("input")[0]?.setValue("   ");
    await vi.advanceTimersByTimeAsync(1000);
    await flushPromises();
    expect(updateSound).not.toHaveBeenCalled();
    expect(w.text()).toContain("A sound needs a name.");
  });

  it("does not delete when the confirm is cancelled", async () => {
    confirm.mockResolvedValue(false);
    const w = mountDialog();
    await button(w, "Delete sound")?.trigger("click");
    await flushPromises();
    expect(deleteSound).not.toHaveBeenCalled();
    expect(w.emitted("close")).toBeUndefined();
  });

  it("stops and deletes the sound after a confirm, then closes", async () => {
    confirm.mockResolvedValue(true);
    const w = mountDialog();
    await button(w, "Delete sound")?.trigger("click");
    await flushPromises();
    expect(stop).toHaveBeenCalledWith("s1");
    expect(deleteSound).toHaveBeenCalledWith(tavern);
    expect(w.emitted("close")).toHaveLength(1);
  });
});
