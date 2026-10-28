import { mount } from "@vue/test-utils";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import CartographerAiStyleModal from "./CartographerAiStyleModal.vue";

const mocks = vi.hoisted(() => ({
  requireCredits: vi.fn().mockReturnValue(true),
  confirm: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/composables/ai/useOutOfCredits", () => ({
  useOutOfCredits: () => ({ requireCredits: mocks.requireCredits }),
}));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));

const AppModalStub = { props: ["open"], emits: ["close"], template: "<div><slot /></div>" };
const stubs = { AppModal: AppModalStub, EntityCombobox: true, GenerationCostBadge: true };

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
  describe("the styled result", () => {
    it("saves to the location picked, and not while a save is running", async () => {
      const wrapper = mountModal({ showPicker: false, showResult: true, atlasLocationId: "loc-9" });
      const save = findButton(wrapper, "Save to Atlas");
      expect(save.props("disabled")).toBe(false);
      await save.trigger("click");
      expect(wrapper.emitted("saveToAtlas")).toEqual([["loc-9"]]);
      const busy = mountModal({ showPicker: false, showResult: true, atlasLocationId: "loc-9", atlasSaving: true });
      expect(findButton(busy, "Saving…").props("disabled")).toBe(true);
    });

    it("discards an unsaved render only after the DM agrees, and keeps it otherwise", async () => {
      const wrapper = mountModal({ showPicker: false, showResult: true, resultUrl: "blob:styled" });
      const resultModal = wrapper.findAllComponents(AppModalStub).find((m) => m.props("open") === true)!;
      mocks.confirm.mockResolvedValue(false);
      resultModal.vm.$emit("close");
      await vi.waitFor(() => expect(mocks.confirm).toHaveBeenCalledTimes(1));
      expect(wrapper.emitted("closeResult")).toBeUndefined();
      mocks.confirm.mockResolvedValue(true);
      resultModal.vm.$emit("close");
      await vi.waitFor(() => expect(wrapper.emitted("closeResult")).toHaveLength(1));
    });
  });

  describe("while it renders", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("counts the time so far, from zero for each render", async () => {
      const wrapper = mountModal({ generating: true });
      expect(wrapper.text()).toContain("0:00 so far");
      await vi.advanceTimersByTimeAsync(65_000);
      expect(wrapper.text()).toContain("1:05 so far");
      await wrapper.setProps({ generating: false });
      await wrapper.setProps({ generating: true });
      expect(wrapper.text()).toContain("0:00 so far");
    });
  });
});
