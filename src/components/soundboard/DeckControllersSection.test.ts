import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import DeckControllersSection from "@/components/soundboard/DeckControllersSection.vue";
import type { LearnTarget, MidiBinding } from "@/lib/audio/deck/midi/midiLearn";

const midi = {
  support: ref("granted"),
  error: ref<string | null>(null),
  launchpads: ref<{ id: string; label: string; portName: string }[]>([]),
  otherInputs: ref<{ id: string; name: string }[]>([]),
  lightsEnabled: ref(true),
  bindings: ref<MidiBinding[]>([]),
  learning: ref<LearnTarget | null>(null),
  connect: vi.fn(),
  disconnect: vi.fn(),
  setLightsEnabled: vi.fn(),
  beginLearn: vi.fn((t: LearnTarget) => {
    midi.learning.value = t;
  }),
  cancelLearn: vi.fn(() => {
    midi.learning.value = null;
  }),
  removeBinding: vi.fn(),
};
const deck = { velocityCurve: ref("even"), setVelocityCurve: vi.fn() };

vi.mock("@/composables/soundboard/useDeckMidiShared", () => ({ useDeckMidiShared: () => midi }));
vi.mock("@/composables/soundboard/useDeck", () => ({ useDeck: () => deck }));

const binding: MidiBinding = {
  deviceName: "Keystation",
  kind: "cc",
  channel: 0,
  number: 7,
  target: { type: "master" },
};

beforeEach(() => {
  vi.clearAllMocks();
  midi.support.value = "granted";
  midi.error.value = null;
  midi.launchpads.value = [];
  midi.bindings.value = [];
  midi.learning.value = null;
});

describe("DeckControllersSection", () => {
  it("shows only the Safari note when MIDI is unsupported", () => {
    midi.support.value = "unsupported";
    const w = mount(DeckControllersSection);
    expect(w.text()).toContain("Safari can't talk to MIDI controllers");
    expect(w.findAll("button")).toHaveLength(0);
  });

  it("asks for MIDI only when the button is pressed", async () => {
    midi.support.value = "idle";
    const w = mount(DeckControllersSection);
    expect(midi.connect).not.toHaveBeenCalled();
    await w.find("button").trigger("click");
    expect(midi.connect).toHaveBeenCalledTimes(1);
  });

  it("explains how to allow MIDI when denied", () => {
    midi.support.value = "denied";
    expect(mount(DeckControllersSection).text()).toContain("site settings");
  });

  it("learns the chosen target, one-based in the picker and zero-based in the binding", async () => {
    const w = mount(DeckControllersSection);
    await w.findAll("button").find((b) => b.text() === "Learn a control")?.trigger("click");
    const selects = w.findAll("select");
    await selects[1].setValue("3"); // lane 3
    await selects[2].setValue("2"); // row 2
    await w.findAll("button").find((b) => b.text() === "Start")?.trigger("click");
    expect(midi.beginLearn).toHaveBeenCalledWith({ type: "pad", lane: 2, row: 1 });
    expect(w.text()).toContain("Press the key or turn the knob");
  });

  it("cancels a learn in progress", async () => {
    midi.learning.value = { type: "hush" };
    const w = mount(DeckControllersSection);
    await w.findAll("button").find((b) => b.text() === "Cancel")?.trigger("click");
    expect(midi.cancelLearn).toHaveBeenCalled();
  });

  it("removes a learned binding", async () => {
    midi.bindings.value = [binding];
    const w = mount(DeckControllersSection);
    expect(w.text()).toContain("Master volume");
    await w.findAll("button").find((b) => b.text() === "Remove")?.trigger("click");
    expect(midi.removeBinding).toHaveBeenCalledWith(binding);
  });

  it("sets the velocity curve for a connected Launchpad", async () => {
    midi.launchpads.value = [{ id: "a", label: "Launchpad Pro MK3", portName: "LPProMK3 MIDI" }];
    const w = mount(DeckControllersSection);
    expect(w.text()).toContain("Launchpad Pro MK3 · connected");
    await w.findAll("button").find((b) => b.text() === "Punchy")?.trigger("click");
    expect(deck.setVelocityCurve).toHaveBeenCalledWith("punchy");
  });
});
