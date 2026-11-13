import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import QuestOpenedReadAloud from "./QuestOpenedReadAloud.vue";
import { toTiptapJson } from "@/lib/tiptap/markdownToTiptap";
import type { QuestBeat } from "@/types/quest.types";

const beat = (read_aloud: string | null) => ({ id: "b", read_aloud } as QuestBeat);
const stubs = { RichTextViewer: { name: "RichTextViewer", props: ["content"], template: "<div data-test='viewer' />" } };

describe("QuestOpenedReadAloud", () => {
  // Bug: a folded read-aloud that still mounted the full text defeats the fold at a site.
  it("folded shows only the first line until opened", async () => {
    const wrapper = mount(QuestOpenedReadAloud, { props: { beat: beat(toTiptapJson("The door is wet.\n\nA second paragraph.")), folded: true }, global: { stubs } });
    expect(wrapper.text()).toContain("The door is wet.");
    expect(wrapper.text()).not.toContain("second paragraph");
    expect(wrapper.find('[data-test="viewer"]').exists()).toBe(false);
    await wrapper.find("button").trigger("click");
    expect(wrapper.find('[data-test="viewer"]').exists()).toBe(true);
  });

  it("unfolded shows the whole text at once", () => {
    const wrapper = mount(QuestOpenedReadAloud, { props: { beat: beat(toTiptapJson("The door is wet.")) }, global: { stubs } });
    expect(wrapper.find('[data-test="viewer"]').exists()).toBe(true);
  });

  // Bug: an emptied editor leaves a blank doc, which would draw an empty "Read aloud" box.
  it("draws nothing for a blank doc", () => {
    const wrapper = mount(QuestOpenedReadAloud, { props: { beat: beat(toTiptapJson("")) }, global: { stubs } });
    expect(wrapper.find("section").exists()).toBe(false);
  });
});
