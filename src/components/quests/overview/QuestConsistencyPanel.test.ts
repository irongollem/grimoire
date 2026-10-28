import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import QuestConsistencyPanel from "./QuestConsistencyPanel.vue";
import type { QuestConsistencyFinding } from "@/lib/quests/consistency";

function finding(overrides: Partial<QuestConsistencyFinding> & Pick<QuestConsistencyFinding, "kind" | "message">): QuestConsistencyFinding {
  return { ...overrides };
}

describe("QuestConsistencyPanel", () => {
  it("renders nothing when there are no findings", () => {
    const wrapper = mount(QuestConsistencyPanel, { props: { findings: [] } });
    expect(wrapper.find("section").exists()).toBe(false);
    expect(wrapper.text()).toBe("");
  });

  it("orders non-advisory findings before advisory ones, regardless of input order", () => {
    const advisory = finding({ kind: "objective_never_resolves", message: "Nothing completes or fails this.", advisory: true });
    const primary = finding({ kind: "unreachable_beat", message: "This beat cannot be reached." });
    const wrapper = mount(QuestConsistencyPanel, { props: { findings: [advisory, primary] } });

    const items = wrapper.findAll("li").map((li) => li.text());
    expect(items).toEqual([primary.message, advisory.message]);
  });

  it("renders each finding's message verbatim", () => {
    const message = 'A route waits for "Free the prisoner" to be complete, and nothing ever sets it. That branch can never be taken.';
    const wrapper = mount(QuestConsistencyPanel, {
      props: { findings: [finding({ kind: "gate_never_opens", message })] },
    });
    expect(wrapper.text()).toContain(message);
  });
});
