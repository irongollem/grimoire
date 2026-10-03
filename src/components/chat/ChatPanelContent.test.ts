import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { createPinia, setActivePinia } from "pinia";

vi.mock("@/composables/campaign/useWhisperRecipients", () => ({
  useWhisperTarget: () => ({ whisperTarget: ref(""), whisperableMembers: ref([]) }),
}));
vi.mock("@/composables/items/useItems", () => ({
  useItems: () => ({ data: ref([]) }),
}));
vi.mock("@/composables/dice/usePromptedRoll", () => ({
  usePromptedRoll: () => ({ promptRoll: vi.fn() }),
}));

import ChatPanelContent from "./ChatPanelContent.vue";

function mountPanel(sendText: (p: { text: string; recipientUserId: string | null }) => Promise<boolean>) {
  setActivePinia(createPinia());
  return mount(ChatPanelContent, {
    props: {
      messages: [],
      loading: false,
      loadingOlder: false,
      hasOlder: false,
      myUserId: "me",
      members: [],
      party: [],
      npcs: [],
      sendText,
    },
  });
}

describe("ChatPanelContent send", () => {
  it("clears the box when the message is posted", async () => {
    const sendText = vi.fn().mockResolvedValue(true);
    const wrapper = mountPanel(sendText);
    const box = wrapper.get("textarea");
    await box.setValue("hello there");
    await box.trigger("keydown.enter");
    await vi.waitFor(() => expect(sendText).toHaveBeenCalled());
    expect(sendText).toHaveBeenCalledWith({ text: "hello there", recipientUserId: null });
    await wrapper.vm.$nextTick();
    expect((box.element as HTMLTextAreaElement).value).toBe("");
  });

  it("restores the typed text when the send fails", async () => {
    const sendText = vi.fn().mockResolvedValue(false);
    const wrapper = mountPanel(sendText);
    const box = wrapper.get("textarea");
    await box.setValue("do not lose me");
    await box.trigger("keydown.enter");
    await vi.waitFor(() => expect(sendText).toHaveBeenCalled());
    await vi.waitFor(() => expect((box.element as HTMLTextAreaElement).value).toBe("do not lose me"));
  });
});
