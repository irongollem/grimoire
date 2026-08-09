import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import QuestGraphOutline from "./QuestGraphOutline.vue";
import type { QuestBeat } from "@/types/quest.types";

const beat = (id: string): QuestBeat => ({ id, quest_id: "q", campaign_id: "c", title: id, dm_content: null, rumor_text: null, reveal_text: null, visibility: "hidden", kind: "neutral", presentation_hint: null, canvas_x: 0, canvas_y: 0, is_improvised: false, created_by: "dm", created_at: "now", updated_at: "now" });

describe("QuestGraphOutline", () => {
  it("offers create, open, link, and delete without the canvas", async () => {
    const wrapper = mount(QuestGraphOutline, { props: { beats: [beat("a"), beat("b")], selectedBeatId: "a" } });
    const buttons = wrapper.findAll("button");
    await buttons.find((button) => button.text() === "Add beat")!.trigger("click");
    await wrapper.findAll("li")[1]!.find("button").trigger("click");
    await buttons.find((button) => button.text() === "Link")!.trigger("click");
    await buttons.find((button) => button.text() === "Delete")!.trigger("click");
    const commands = wrapper.emitted("command")!.map((event) => event[0]);
    expect(commands).toContainEqual({ type: "create" });
    expect(commands).toContainEqual({ type: "open", beatId: "b" });
    expect(commands).toContainEqual({ type: "link", sourceBeatId: "a", targetBeatId: "b" });
    expect(commands).toContainEqual({ type: "delete-beat", beatId: "a" });
  });

  it("keeps selection available while hiding later authoring actions in read mode", () => {
    const wrapper = mount(QuestGraphOutline, { props: { beats: [beat("a")], selectedBeatId: "a", editable: false } });
    expect(wrapper.text()).not.toContain("Add beat");
    expect(wrapper.text()).not.toContain("Delete");
    expect(wrapper.text()).toContain("a");
  });
});
