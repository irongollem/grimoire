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

function mountPanel(sendText: (p: { text: string; recipientUserId: string | null; mentions: unknown[] }) => Promise<boolean>, messages: CampaignMessage[] = [], party: { id: string; name: string }[] = []) {
  setActivePinia(createPinia());
  return mount(ChatPanelContent, {
    props: {
      messages,
      loading: false,
      loadingOlder: false,
      hasOlder: false,
      myUserId: "me",
      members: [],
      party: party as never,
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
    await box.trigger("keydown", { key: "Enter" });
    await vi.waitFor(() => expect(sendText).toHaveBeenCalled());
    expect(sendText).toHaveBeenCalledWith({ text: "hello there", recipientUserId: null, mentions: [] });
    await wrapper.vm.$nextTick();
    expect((box.element as HTMLTextAreaElement).value).toBe("");
  });

  it("restores the typed text when the send fails", async () => {
    const sendText = vi.fn().mockResolvedValue(false);
    const wrapper = mountPanel(sendText);
    const box = wrapper.get("textarea");
    await box.setValue("do not lose me");
    await box.trigger("keydown", { key: "Enter" });
    await vi.waitFor(() => expect(sendText).toHaveBeenCalled());
    await vi.waitFor(() => expect((box.element as HTMLTextAreaElement).value).toBe("do not lose me"));
  });

  it("sends nothing for a box that holds only spaces", async () => {
    const sendText = vi.fn().mockResolvedValue(true);
    const wrapper = mountPanel(sendText);
    const box = wrapper.get("textarea");
    await box.setValue("   \n ");
    await box.trigger("keydown", { key: "Enter" });
    await wrapper.vm.$nextTick();
    expect(sendText).not.toHaveBeenCalled();
  });

  it("whispers to the chosen player and to nobody else", async () => {
    whisper.target.value = "user-7";
    const sendText = vi.fn().mockResolvedValue(true);
    const wrapper = mountPanel(sendText);
    const box = wrapper.get("textarea");
    await box.setValue("psst");
    await box.trigger("keydown", { key: "Enter" });
    await vi.waitFor(() => expect(sendText).toHaveBeenCalled());
    expect(sendText).toHaveBeenCalledWith({ text: "psst", recipientUserId: "user-7", mentions: [] });
    whisper.target.value = "";
  });

  it("does not overwrite what the reader typed next when the earlier send fails", async () => {
    let fail: (ok: boolean) => void = () => undefined;
    const sendText = vi.fn().mockReturnValue(new Promise<boolean>((resolve) => (fail = resolve)));
    const wrapper = mountPanel(sendText);
    const box = wrapper.get("textarea");
    await box.setValue("first try");
    await box.trigger("keydown", { key: "Enter" });
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

// #1021 row 26: an "@" addresses a character, the Dungeon Master or the whole party in front of the table.
describe("ChatPanelContent mentions", () => {
  const party = [{ id: "pm-rosie", name: "Rosie" }, { id: "pm-chic", name: "Chicory" }];

  async function type(box: ReturnType<ReturnType<typeof mountPanel>["get"]>, text: string) {
    const el = box.element as HTMLTextAreaElement;
    el.value = text;
    el.setSelectionRange(text.length, text.length);
    await box.trigger("input");
  }

  it("Enter picks the offered name instead of sending the half-typed line", async () => {
    whisper.target.value = "";
    const sendText = vi.fn().mockResolvedValue(true);
    const wrapper = mountPanel(sendText, [], party);
    const box = wrapper.get("textarea");
    await type(box, "hold on @ro");
    expect(wrapper.find('[role="listbox"]').text()).toContain("@Rosie");
    await box.trigger("keydown", { key: "Enter" });
    expect(sendText).not.toHaveBeenCalled();
    expect((box.element as HTMLTextAreaElement).value).toBe("hold on @Rosie ");
  });

  it("Shift+Enter does not pick a mention", async () => {
    whisper.target.value = "";
    const wrapper = mountPanel(vi.fn().mockResolvedValue(true), [], party);
    const box = wrapper.get("textarea");
    await type(box, "hold on @ro");
    await box.trigger("keydown", { key: "Enter", shiftKey: true });
    expect((box.element as HTMLTextAreaElement).value).toBe("hold on @ro");
  });

  it("an input method's confirming Enter neither picks a mention nor sends", async () => {
    whisper.target.value = "";
    const sendText = vi.fn().mockResolvedValue(true);
    const wrapper = mountPanel(sendText, [], party);
    const box = wrapper.get("textarea");
    await type(box, "hold on @ro");
    await box.trigger("keydown", { key: "Enter", isComposing: true });
    expect((box.element as HTMLTextAreaElement).value).toBe("hold on @ro");
    await type(box, "plain words");
    await box.trigger("keydown", { key: "Enter", keyCode: 229 });
    expect(sendText).not.toHaveBeenCalled();
  });

  it("sends whom the line addresses with it, the whole party included", async () => {
    whisper.target.value = "";
    const sendText = vi.fn().mockResolvedValue(true);
    const wrapper = mountPanel(sendText, [], party);
    const box = wrapper.get("textarea");
    await type(box, "@party to me, and @Chicory first");
    await box.trigger("keydown", { key: "Escape" });
    await box.trigger("keydown", { key: "Enter" });
    await vi.waitFor(() => expect(sendText).toHaveBeenCalled());
    expect(sendText.mock.calls[0][0].mentions).toEqual([
      { kind: "party", party_member_id: null, name: "party" },
      { kind: "member", party_member_id: "pm-chic", name: "Chicory" },
    ]);
  });

  it("marks a line that addresses the reader's character, and not their own line or one for someone else", async () => {
    const line = (id: string, user: string, mentions: unknown[]): CampaignMessage => ({
      id, campaign_id: "c1", user_id: user, recipient_user_id: null, sender_name: "Sam", type: "chat", message: "x",
      created_at: `2026-10-01T10:00:0${id}Z`, metadata: { mentions }, server_rolled: false,
    } as CampaignMessage);
    const toRosie = [{ kind: "member", party_member_id: "pm-rosie", name: "Rosie" }];
    const wrapper = mountPanel(vi.fn(), [
      line("1", "them", toRosie),
      line("2", "them", [{ kind: "member", party_member_id: "pm-chic", name: "Chicory" }]),
      line("3", "me", toRosie),
      line("4", "them", [{ kind: "party", party_member_id: null, name: "party" }]),
    ], party);
    const { useAuthStore } = await import("@/stores/auth");
    // The reader is a player whose character is Rosie.
    useAuthStore().membership = { role: "player", party_member_id: "pm-rosie" } as never;
    await wrapper.vm.$nextTick();
    const marked = wrapper.findAll("[data-message-id]").filter((e) => e.find("[data-addressed]").exists()).map((e) => e.attributes("data-message-id"));
    expect(marked).toEqual(["1", "4"]);
  });

  // AI Act Art. 50: a line a model wrote must say so. Bug caught: the mark missing, or put on a person's line.
  it("marks a line the AI wrote for an absent player's character, and no line a person typed", () => {
    const line = (id: string, metadata: unknown): CampaignMessage => ({
      id, campaign_id: "c1", user_id: "them", recipient_user_id: null, sender_name: "Chicory", type: "chat", message: "Aye.",
      created_at: `2026-10-01T10:00:0${id}Z`, metadata, server_rolled: false,
    } as CampaignMessage);
    const wrapper = mountPanel(vi.fn(), [line("1", { ai: true, for_party_member_id: "pm-chic", reply_to: "0" }), line("2", { for_party_member_id: "pm-chic" })], party);
    const marked = wrapper.findAll("[data-message-id]").filter((e) => e.find('[data-testid="chat-ai-mark"]').exists()).map((e) => e.attributes("data-message-id"));
    expect(marked).toEqual(["1"]);
  });
});
