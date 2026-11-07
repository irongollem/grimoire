import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { reactive, ref } from "vue";
import SoundboardMixer from "@/components/soundboard/SoundboardMixer.vue";

const store = reactive({
  isCasting: false,
  directOutput: false,
  volumeControlAvailable: true,
  volumeControlNote: null,
  masterVolume: 1,
  masterEffect: "none",
  busVolumes: { music: 1, ambient: 1, effects: 1 },
  busEffects: { music: "none", ambient: "none", effects: "none" },
  activeAmbientPlaylists: [],
  setMasterVolume: vi.fn(),
  setMasterEffect: vi.fn(),
  setBusVolume: vi.fn(),
  setBusEffect: vi.fn(),
  setDirectOutput: vi.fn(),
});

vi.mock("@/stores/soundboard", () => ({ useSoundboardStore: () => store }));
vi.mock("@/stores/ui/soundboard", () => ({ useSoundboardUiStore: () => ({ soundboardSettingsOpen: false }) }));
vi.mock("@/composables/soundboard/useCast", () => ({ useCast: () => ({ isCastAvailable: ref(false) }) }));
vi.mock("@/composables/soundboard/useAudioThemeTriggers", () => ({ useAudioTriggerPrefs: () => ({ audioTriggersEnabled: ref(false) }) }));
vi.mock("@/composables/soundboard/useSoundboardBroadcast", () => ({
  useSoundboardBroadcast: () => ({ broadcasting: ref(false), broadcastError: ref(null) }),
}));
vi.mock("vue-router", () => ({ useRoute: () => ({ path: "/soundboard" }), useRouter: () => ({ push: vi.fn() }) }));

function mountMixer() {
  return mount(SoundboardMixer, { global: { stubs: { SceneMixer: true, CastButton: true } } });
}

describe("SoundboardMixer bus effects", () => {
  // A row's picker must drive its own bus: a v-for that bound the wrong id would put the
  // music behind a door when the DM asked it of the ambience.
  it("gives each bus its own picker, wired to that bus", () => {
    const pickers = mountMixer().findAllComponents({ name: "SoundEffectPicker" });
    expect(pickers.map((p) => p.props("target"))).toEqual(["Master", "Music", "Ambience", "Effects"]);
    pickers[2].vm.$emit("update:modelValue", "through_door");
    expect(store.setBusEffect).toHaveBeenCalledWith("ambient", "through_door");
  });

  // Direct output has no graph to colour, so a picker there would do nothing.
  it("offers no effects under direct output", () => {
    store.directOutput = true;
    expect(mountMixer().findAllComponents({ name: "SoundEffectPicker" })).toHaveLength(0);
    store.directOutput = false;
  });
});

describe("SoundboardMixer output switch", () => {
  // One tap from the deck in the car (wireless CarPlay stutters through the mixer,
  // 7 Nov 2026). An inverted mapping would turn the mixer back on in the car.
  it.each([
    ["direct", false, true],
    ["mixer", true, false],
  ] as const)("picking %s while %s asks for direct output %s", (pick, startsDirect, expected) => {
    store.directOutput = startsDirect;
    const control = mountMixer().findComponent({ name: "SegmentedControl" });
    control.vm.$emit("update:modelValue", pick);
    expect(store.setDirectOutput).toHaveBeenLastCalledWith(expected);
    store.directOutput = false;
  });
});
