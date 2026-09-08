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
    const message = 'A route waits for "Free the prisoner" to be complete, and nothing ever sets it — that branch can never be taken.';
    const wrapper = mount(QuestConsistencyPanel, {
      props: { findings: [finding({ kind: "gate_never_opens", message })] },
    });
    expect(wrapper.text()).toContain(message);
  });

  it("gives advisory findings a visually quieter treatment than non-advisory ones", () => {
    const wrapper = mount(QuestConsistencyPanel, {
      props: {
        findings: [
          finding({ kind: "unreachable_beat", message: "Cannot be reached." }),
          finding({ kind: "objective_never_resolves", message: "Ticked by hand only.", advisory: true }),
        ],
      },
    });
    const items = wrapper.findAll("li");
    expect(items[0]!.classes()).toContain("text-tone-caution");
    expect(items[1]!.classes()).not.toContain("text-tone-caution");
    expect(items[1]!.classes()).toContain("text-muted-foreground");
  });
});
