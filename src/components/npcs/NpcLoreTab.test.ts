import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import NpcLoreTab from "./NpcLoreTab.vue";

vi.mock("@/composables/notes/useEntityMentionItems", () => ({
  useEntityMentionItems: () => ({ mentionItems: { value: [] } }),
}));

const stubs = { RichTextEditor: true };

describe("NpcLoreTab Voice field", () => {
  // Bug caught: Voice typed but never emitted, so the form never went dirty.
  it("emits what is typed as plain text", async () => {
    const wrapper = mount(NpcLoreTab, { global: { stubs } });
    await wrapper.find("textarea#npc-voice").setValue("Low and slow.");
    expect(wrapper.emitted("update:voice")?.[0]).toEqual(["Low and slow."]);
  });

  // Bug caught: the field not showing the stored voice, so an edit starts from blank and overwrites it.
  it("shows the stored voice", () => {
    const wrapper = mount(NpcLoreTab, { props: { voice: "Clipped." }, global: { stubs } });
    expect((wrapper.find("textarea#npc-voice").element as HTMLTextAreaElement).value).toBe("Clipped.");
  });

  // Bug caught: no cap, so the DM writes past where the profile builder cuts and loses the tail silently.
  it("stops at the 400 characters the profile builder keeps", () => {
    const wrapper = mount(NpcLoreTab, { global: { stubs } });
    expect(wrapper.find("textarea#npc-voice").attributes("maxlength")).toBe("400");
  });
});
