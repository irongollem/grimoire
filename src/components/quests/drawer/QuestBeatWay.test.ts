import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import QuestBeatWay from "./QuestBeatWay.vue";
import type { QuestBeatEdge } from "@/types/quest.types";

const edge = (label: string | null) => ({ id: "e1", source_beat_id: "a", target_beat_id: "b", route_kind: "choice", label, note: null }) as QuestBeatEdge;

describe("QuestBeatWay", () => {
  // Fails if an unlabelled route names its target twice ("To Tomb" beside "Tomb"), as it did on first build.
  it("names an unlabelled route's target once, in its heading", () => {
    const wrapper = mount(QuestBeatWay, { props: { edge: edge(null), targetTitle: "Garagai's Tomb" } });
    expect(wrapper.text().match(/Garagai's Tomb/g)).toHaveLength(1);
    expect(wrapper.text()).toContain("To Garagai's Tomb");
  });

  // Fails if a labelled route loses the link to where it leads, which is how the DM jumps to that beat.
  it("shows a labelled route's target as its own link", async () => {
    const wrapper = mount(QuestBeatWay, { props: { edge: edge("Sneak in by the kennels"), targetTitle: "Garagai's Tomb" } });
    await wrapper.get('[aria-label="Go to Garagai\'s Tomb"]').trigger("click");
    expect(wrapper.emitted("select-beat")).toEqual([["b"]]);
  });
});
