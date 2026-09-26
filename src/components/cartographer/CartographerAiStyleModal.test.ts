import { mount } from "@vue/test-utils";
import { describe, it, expect, beforeEach, vi } from "vitest";
import CartographerAiStyleModal from "./CartographerAiStyleModal.vue";

const mocks = vi.hoisted(() => ({
  requireCredits: vi.fn().mockReturnValue(true),
  confirm: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/composables/ai/useOutOfCredits", () => ({
  useOutOfCredits: () => ({ requireCredits: mocks.requireCredits }),
}));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));

const stubs = { AppModal: { template: "<div><slot /></div>" }, EntityCombobox: true, GenerationCostBadge: true };

function mountModal(props: Partial<InstanceType<typeof CartographerAiStyleModal>["$props"]> = {}) {
  return mount(CartographerAiStyleModal, {
    props: {
      showPicker: true,
      showResult: false,
      presets: [],
      selectedPresetId: "playable",
      promptSuffix: "",
      generating: false,
      error: null,
      resultUrl: null,
      locationOptions: [],
      atlasTargetHasMap: false,
      atlasError: null,
      atlasSaving: false,
      credits: 1,
      byok: false,
      ...props,
    },
    global: { stubs },
  });
}

function findButton(wrapper: ReturnType<typeof mountModal>, label: string) {
  const button = wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === label);
  if (!button) throw new Error(`no AppButton labelled "${label}"`);
  return button;
}

describe("CartographerAiStyleModal", () => {
  beforeEach(() => {
    mocks.requireCredits.mockClear();
    mocks.requireCredits.mockReturnValue(true);
    mocks.confirm.mockClear();
    mocks.confirm.mockResolvedValue(true);
  });

  describe("standalone flow (no fixedTargetLabel)", () => {
    it("emits generate on click without asking for confirmation", async () => {
      const wrapper = mountModal();
      await findButton(wrapper, "Generate").trigger("click");
      expect(mocks.confirm).not.toHaveBeenCalled();
      expect(wrapper.emitted("generate")).toHaveLength(1);
    });

    it("does not generate when out of credits", async () => {
      mocks.requireCredits.mockReturnValue(false);
      const wrapper = mountModal();
      await findButton(wrapper, "Generate").trigger("click");
      expect(wrapper.emitted("generate")).toBeUndefined();
    });
  });

  describe("fixed-target flow (Atlas Build)", () => {
    it("asks a plain-language confirm before generating, and proceeds once confirmed", async () => {
      const wrapper = mountModal({ fixedTargetLabel: "Ashmouth Undercroft" });
      await findButton(wrapper, "Generate").trigger("click");
      expect(mocks.confirm).toHaveBeenCalledTimes(1);
      const [message] = mocks.confirm.mock.calls[0] as [string];
      expect(message).not.toContain("—"); // no em-dash
      expect(message.toLowerCase()).toContain("picture");
      expect(message.toLowerCase()).toContain("set aside");
      await wrapper.vm.$nextTick();
      expect(wrapper.emitted("generate")).toHaveLength(1);
    });

    it("does not generate when the confirm is declined", async () => {
      mocks.confirm.mockResolvedValue(false);
      const wrapper = mountModal({ fixedTargetLabel: "Ashmouth Undercroft" });
      await findButton(wrapper, "Generate").trigger("click");
      expect(wrapper.emitted("generate")).toBeUndefined();
    });

    it("names the site instead of showing a location picker, in the result panel", () => {
      const wrapper = mountModal({ showPicker: false, showResult: true, fixedTargetLabel: "Ashmouth Undercroft" });
      expect(wrapper.text()).toContain("Ashmouth Undercroft");
      expect(wrapper.findComponent({ name: "EntityCombobox" }).exists()).toBe(false);
      expect(() => findButton(wrapper, "Save to Picture")).not.toThrow();
    });

    it("enables Save to Picture with no location chosen, unlike the free-pick flow", () => {
      const wrapper = mountModal({ showPicker: false, showResult: true, fixedTargetLabel: "Ashmouth Undercroft" });
      const button = findButton(wrapper, "Save to Picture");
      expect(button.props("disabled")).toBe(false);
    });
  });

  describe("free-pick result panel", () => {
    it("shows the combobox and disables Save to Atlas until a location is chosen", () => {
      const wrapper = mountModal({ showPicker: false, showResult: true });
      expect(wrapper.findComponent({ name: "EntityCombobox" }).exists()).toBe(true);
      const button = findButton(wrapper, "Save to Atlas");
      expect(button.props("disabled")).toBe(true);
    });
  });
});
