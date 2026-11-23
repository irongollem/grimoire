// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AiNoticeDialog from "./AiNoticeDialog.vue";
import { AI_USE_NOTICE_VERSION } from "@/lib/legal";

const acknowledge = vi.fn();
vi.mock("@/composables/ai/useAiAcknowledgements", () => ({
  useAiAcknowledgements: () => ({ acknowledge }),
}));

// The modal's own close (Escape, backdrop) and the header's cross, each as a button to press.
const stubs = {
  AppModal: {
    props: ["open"],
    emits: ["close"],
    template: "<div v-if='open'><button class='modal-close' @click=\"$emit('close')\" /><slot /></div>",
  },
  ModalHeader: { emits: ["close"], template: "<button class='header-close' @click=\"$emit('close')\" />" },
  RouterLink: { template: "<a><slot /></a>" },
};

function render(mode: "notice" | "choose") {
  return mount(AiNoticeDialog, {
    props: { modelValue: true, kind: "ai_use", mode },
    global: { stubs },
  });
}

function button(wrapper: ReturnType<typeof render>, label: string) {
  const found = wrapper.findAll("button").find((b) => b.text() === label);
  if (!found) throw new Error(`no button "${label}"`);
  return found;
}

beforeEach(() => {
  acknowledge.mockReset();
  acknowledge.mockResolvedValue(undefined);
});

describe("AiNoticeDialog chooser: AI is the default", () => {
  it.each(["modal-close", "header-close"])("closing it (%s) records the notice and chooses AI on", async (cls) => {
    const wrapper = render("choose");
    await wrapper.find(`.${cls}`).trigger("click");
    await flushPromises();
    expect(acknowledge).toHaveBeenCalledWith("ai_use", AI_USE_NOTICE_VERSION);
    expect(wrapper.emitted("confirm")).toHaveLength(1);
    expect(wrapper.emitted("cancel")).toBeUndefined();
  });

  it("only Keep AI off turns it off, without recording the notice", async () => {
    const wrapper = render("choose");
    await button(wrapper, "Keep AI off").trigger("click");
    await flushPromises();
    expect(acknowledge).not.toHaveBeenCalled();
    expect(wrapper.emitted("cancel")).toHaveLength(1);
    expect(wrapper.emitted("confirm")).toBeUndefined();
  });
});

describe("AiNoticeDialog plain notice", () => {
  it("closing it is a cancel, not an acknowledgement", async () => {
    const wrapper = render("notice");
    await wrapper.find(".modal-close").trigger("click");
    await flushPromises();
    expect(acknowledge).not.toHaveBeenCalled();
    expect(wrapper.emitted("cancel")).toHaveLength(1);
  });
});
