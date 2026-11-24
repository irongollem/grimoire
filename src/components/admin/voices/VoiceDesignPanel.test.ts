import { describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, ref } from "vue";
import type { DesignedPreview, SpeechVoice, SpeechVoiceFields } from "@/types/speechVoice.types";

vi.mock("@/composables/voices/useSpeechVoices", async () => {
  const { ref } = await import("vue");
  return { useAudioToggle: () => ({ playing: ref(null), loading: ref(null), problem: ref(null), toggle: async () => undefined, reset: () => undefined }) };
});

import VoiceDesignPanel from "./VoiceDesignPanel.vue";

// AppModal teleports and animates; the panel's own behaviour is what is under test, so the shell renders inline.
const AppModalStub = defineComponent({ props: { open: Boolean }, template: "<div v-if='open'><slot /></div>" });
const CheckboxStub = defineComponent({
  props: { modelValue: Boolean, label: String },
  emits: ["update:modelValue"],
  template: "<label><input type='checkbox' :checked='modelValue' @change=\"$emit('update:modelValue', $event.target.checked)\" />{{ label }}</label>",
});

const fields: SpeechVoiceFields = { name: "Shady guy", description: "", design_prompt: "hushed", preview_text: "x".repeat(120), sex: null, age: null, kind: "cast" };
const preview: DesignedPreview = { id: "draft-1", audio: "QUJD", mediaType: "audio/mpeg" };

function slot(overrides: Partial<SpeechVoice> = {}): SpeechVoice {
  return { id: "s1", ...fields, origin: "designed", service: "elevenlabs", voice_id: "voice-abcdefgh", sample_key: null, active: true, created_at: "", updated_at: "", ...overrides } as SpeechVoice;
}

async function mountPanel(voice: SpeechVoice | null) {
  const keep = vi.fn(async () => slot());
  const saveSlot = vi.fn(async () => undefined);
  const studio = {
    design: { mutateAsync: vi.fn(async () => [preview]), isPending: ref(false), isError: ref(false), error: ref(null) },
    keep: { mutateAsync: keep },
    saveSlot: { mutateAsync: saveSlot },
  };
  const wrapper = mount(VoiceDesignPanel, {
    props: { slot: voice, fields, studio: studio as never, service: "elevenlabs" },
    global: { stubs: { AppModal: AppModalStub, AppCheckbox: CheckboxStub } },
  });
  await button(wrapper, "Design voices")!.trigger("click");
  await flushPromises();
  return { wrapper, keep, saveSlot };
}

function button(wrapper: ReturnType<typeof mount>, label: string) {
  return wrapper.findAll("button").find((b) => b.text().includes(label));
}

describe("VoiceDesignPanel keep into a slot", () => {
  it("fills an empty slot at once, with no confirmation to wade through", async () => {
    const { wrapper, keep } = await mountPanel(slot({ voice_id: null, service: null }));
    await button(wrapper, "Keep in this slot")!.trigger("click");
    await flushPromises();
    expect(keep).toHaveBeenCalledTimes(1);
  });

  // Bug caught: a voice kept into a slot while its prompt still held the old text, so the slot no longer says what
  // the voice was made from and a redesign starts from the wrong prompt.
  it("saves the prompt and fields the kept voice was designed from onto the slot", async () => {
    const { wrapper, saveSlot } = await mountPanel(slot({ voice_id: null, service: null }));
    await button(wrapper, "Keep in this slot")!.trigger("click");
    await flushPromises();
    expect(saveSlot).toHaveBeenCalledWith({ id: "s1", fields });
  });

  // Bug caught: a keep that failed (no custom slots left, a service error) leaving the slot with the new description
  // and its old voice, so casting matched characters to a voice that does not sound like that.
  it("does not save the slot's fields when the keep fails", async () => {
    const { wrapper, keep, saveSlot } = await mountPanel(slot({ voice_id: null, service: null }));
    keep.mockRejectedValueOnce(new Error("no slots left"));
    await button(wrapper, "Keep in this slot")!.trigger("click");
    await flushPromises();
    expect(saveSlot).not.toHaveBeenCalled();
  });

  it("does not replace a slot's voice until confirmed: cancelling keeps the old voice", async () => {
    const { wrapper, keep } = await mountPanel(slot());
    await button(wrapper, "Keep in this slot")!.trigger("click");
    expect(keep).not.toHaveBeenCalled();
    await button(wrapper, "Cancel")!.trigger("click");
    await flushPromises();
    expect(keep).not.toHaveBeenCalled();
  });

  it("deletes the old designed voice from the service only when the box is ticked", async () => {
    const { wrapper, keep } = await mountPanel(slot({ origin: "designed" }));
    await button(wrapper, "Keep in this slot")!.trigger("click");
    await wrapper.find("input[type='checkbox']").setValue(true);
    await button(wrapper, "Replace voice")!.trigger("click");
    await flushPromises();
    expect(keep).toHaveBeenCalledWith(expect.objectContaining({ retireOld: true }));
  });

  it("offers no delete box for a voice the studio did not make, which would remove it from the account", async () => {
    const { wrapper } = await mountPanel(slot({ origin: "library" }));
    await button(wrapper, "Keep in this slot")!.trigger("click");
    expect(wrapper.find("input[type='checkbox']").exists()).toBe(false);
  });

  it("marks a kept preview and lets another be kept as a new slot under a numbered name", async () => {
    const { wrapper, keep } = await mountPanel(slot({ voice_id: null, service: null }));
    await button(wrapper, "Keep as a new slot")!.trigger("click");
    const name = wrapper.find("input[aria-label='Name of the new slot']");
    expect((name.element as HTMLInputElement).value).toBe("Shady guy 2");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(keep).toHaveBeenCalledWith(expect.objectContaining({ newSlot: expect.objectContaining({ name: "Shady guy 2", design_prompt: "hushed" }) }));
    expect(wrapper.text()).toContain("Kept in");
  });
});
