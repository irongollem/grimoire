import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import QuestBeatWays from "./QuestBeatWays.vue";
import type { QuestBeatEdge } from "@/types/quest.types";

const beats = [{ id: "b1", title: "Gate" }, { id: "b2", title: "Crypt" }, { id: "b3", title: "Tower" }, { id: "b4", title: "Cellar" }];
const edge = (over: Partial<QuestBeatEdge>) =>
  ({ id: "e1", source_beat_id: "b1", target_beat_id: "b2", route_kind: "choice", label: "Go down", note: null, ...over }) as QuestBeatEdge;

function mountWays(edges: QuestBeatEdge[], canTake = false) {
  return mount(QuestBeatWays, { props: { beatId: "b1", edges, beats, canTake } });
}

describe("QuestBeatWays", () => {
  // Fails if a parallel route is filed under the choice stem.
  it("puts choices under 'They choose one' and parallel routes under 'And also', never mixed", () => {
    const wrapper = mountWays([
      edge({ id: "e1", label: "Down" }),
      edge({ id: "e2", target_beat_id: "b3", label: "Up" }),
      edge({ id: "e3", target_beat_id: "b4", route_kind: "parallel", label: "Meanwhile" }),
    ]);
    const choices = wrapper.find('ul[aria-label="Choices"]');
    const alongside = wrapper.find('ul[aria-label="Alongside"]');
    expect(wrapper.text()).toContain("They choose one");
    expect(wrapper.text()).toContain("And also");
    expect(choices.text()).toContain("Down");
    expect(choices.text()).toContain("Up");
    expect(choices.text()).not.toContain("Meanwhile");
    expect(alongside.text()).toContain("Meanwhile");
    expect(alongside.text()).not.toContain("Down");
  });

  // Fails if a lone route is labelled as a choice among several.
  it("a single choice has no group label", () => {
    expect(mountWays([edge({})]).text()).not.toContain("They choose one");
  });

  it("ignores routes that leave other beats", () => {
    const wrapper = mountWays([edge({ source_beat_id: "b2", label: "Elsewhere" })]);
    expect(wrapper.text()).toContain("No routes out yet.");
    expect(wrapper.text()).not.toContain("Elsewhere");
  });

  // Fails if an unlabelled route renders blank.
  it("falls back to 'To <target>' when the route has no label", () => {
    const wrapper = mountWays([edge({ label: "" })]);
    expect(wrapper.text()).toContain("To Crypt");
  });

  it("shows the note only when there is one", () => {
    expect(mountWays([edge({ note: "Costs a torch" })]).text()).toContain("Costs a torch");
    expect(mountWays([edge({ note: null })]).text()).not.toContain("null");
  });

  // Fails if Take is offered while the party is elsewhere.
  it("shows Take only when the party can take it, and emits the edge", async () => {
    expect(mountWays([edge({})]).findAll("button").some((b) => b.text() === "Take")).toBe(false);
    const wrapper = mountWays([edge({ id: "e9" })], true);
    await wrapper.findAll("button").find((b) => b.text() === "Take")!.trigger("click");
    expect(wrapper.emitted("take")).toEqual([["e9"]]);
  });

  it("the target link selects the beat and the label selects the edge", async () => {
    const wrapper = mountWays([edge({ id: "e1" })]);
    await wrapper.findAll("button").find((b) => b.text() === "Crypt")!.trigger("click");
    await wrapper.findAll("button").find((b) => b.text() === "Go down")!.trigger("click");
    expect(wrapper.emitted("select-beat")).toEqual([["b2"]]);
    expect(wrapper.emitted("select-edge")).toEqual([["e1"]]);
  });
});
