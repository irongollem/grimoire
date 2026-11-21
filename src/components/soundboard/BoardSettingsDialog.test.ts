import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import BoardSettingsDialog from "@/components/soundboard/BoardSettingsDialog.vue";

vi.mock("@/composables/soundboard/useAudioThemeTriggers", () => ({
  useAudioTriggerPrefs: () => ({ audioTriggersEnabled: ref(false), setAudioTriggersEnabled: vi.fn() }),
}));
vi.mock("@/composables/soundboard/useSoundboardBroadcast", () => ({
  useSoundboardBroadcast: () => ({ broadcasting: ref(false), broadcastError: ref(null), setBroadcasting: vi.fn() }),
}));
vi.mock("@/stores/soundboard", () => ({ useSoundboardStore: () => ({ directOutput: false, setDirectOutput: vi.fn(), lastFileUrl: () => null, stopAll: vi.fn() }) }));

describe("BoardSettingsDialog", () => {
  it("has a Controllers section and no pad-size control", () => {
    const w = mount(BoardSettingsDialog, {
      props: { open: true },
      global: {
        stubs: {
          AppModal: { template: "<div><slot /></div>" },
          ModalHeader: true,
          DeckControllersSection: { template: "<div>controllers-stub</div>" },
        },
      },
    });
    expect(w.text()).toContain("controllers-stub");
    expect(w.text()).not.toContain("Pad size in Perform");
  });
});
