import { describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { createPinia, setActivePinia } from "pinia";

const whisper = vi.hoisted(() => ({ target: { value: "" } }));
vi.mock("@/composables/campaign/useWhisperRecipients", () => ({
  useWhisperTarget: () => ({ whisperTarget: ref(whisper.target.value), whisperableMembers: ref([]) }),
}));
vi.mock("@/composables/items/useItemIndex", () => ({
  useItemIndex: () => ({ data: ref([]) }),
}));
vi.mock("@/composables/dice/usePromptedRoll", () => ({
  usePromptedRoll: () => ({ promptRoll: vi.fn() }),
}));

import ChatPanelContent from "./ChatPanelContent.vue";
import type { CampaignMessage } from "@/types/chat.types";

function mountPanel(sendText: (p: { text: string; recipientUserId: string | null }) => Promise<boolean>, messages: CampaignMessage[] = []) {
  setActivePinia(createPinia());
  return mount(ChatPanelContent, {
    props: {
      messages,
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

  it("sends nothing for a box that holds only spaces", async () => {
    const sendText = vi.fn().mockResolvedValue(true);
    const wrapper = mountPanel(sendText);
    const box = wrapper.get("textarea");
    await box.setValue("   \n ");
    await box.trigger("keydown.enter");
    await wrapper.vm.$nextTick();
    expect(sendText).not.toHaveBeenCalled();
  });

  it("whispers to the chosen player and to nobody else", async () => {
    whisper.target.value = "user-7";
    const sendText = vi.fn().mockResolvedValue(true);
    const wrapper = mountPanel(sendText);
    const box = wrapper.get("textarea");
    await box.setValue("psst");
    await box.trigger("keydown.enter");
    await vi.waitFor(() => expect(sendText).toHaveBeenCalled());
    expect(sendText).toHaveBeenCalledWith({ text: "psst", recipientUserId: "user-7" });
    whisper.target.value = "";
  });

  it("does not overwrite what the reader typed next when the earlier send fails", async () => {
    let fail: (ok: boolean) => void = () => undefined;
    const sendText = vi.fn().mockReturnValue(new Promise<boolean>((resolve) => (fail = resolve)));
    const wrapper = mountPanel(sendText);
    const box = wrapper.get("textarea");
    await box.setValue("first try");
    await box.trigger("keydown.enter");
    await box.setValue("second thought");
    fail(false);
    await flushPromises();
    expect((box.element as HTMLTextAreaElement).value).toBe("second thought");
  });
});

describe("ChatPanelContent skill-check lines", () => {
  const base = { campaign_id: "c1", recipient_user_id: null, sender_name: "Robin" };
  const flavor = (id: string, user: string): CampaignMessage => ({
    ...base, id, user_id: user, type: "system", message: "Robin tries to sneak", created_at: "2026-10-01T10:00:00Z",
    metadata: { skill_label: "Stealth" },
  } as CampaignMessage);
  const roll = (id: string, user: string): CampaignMessage => ({
    ...base, id, user_id: user, type: "dm_roll", message: "rolled", created_at: "2026-10-01T10:00:01Z",
    metadata: { label: "Stealth", total: 14, breakdown: [{ val: 12, dropped: false }], modifier: 2, isCrit: false, isFumble: false },
  } as CampaignMessage);
  const shownIds = (w: ReturnType<typeof mountPanel>) => w.findAll("[data-message-id]").map((e) => e.attributes("data-message-id"));

  it("folds the flavour line into the roll card that follows it from the same player", () => {
    expect(shownIds(mountPanel(vi.fn(), [flavor("f1", "u1"), roll("r1", "u1")]))).toEqual(["r1"]);
  });

  it("keeps a flavour line that no roll from the same player follows", () => {
    expect(shownIds(mountPanel(vi.fn(), [flavor("f1", "u1"), roll("r1", "u2")]))).toEqual(["f1", "r1"]);
  });
});
