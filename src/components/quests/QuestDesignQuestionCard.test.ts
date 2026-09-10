import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import QuestDesignQuestionCard from "./QuestDesignQuestionCard.vue";
import type { QuestDesignQuestion } from "@/lib/quests/designer";

const question: QuestDesignQuestion = {
  key: "q1",
  about: "b2",
  question: "Does Ravishin survive the parley?",
  why: "The next beat depends on whether Ravishin lives.",
  options: [
    { key: "a", label: "Killed" },
    { key: "b", label: "Came to terms" },
  ],
};

function mountCard(aboutTitle: string | null = "The parley") {
  return mount(QuestDesignQuestionCard, { props: { question, aboutTitle } });
}

describe("QuestDesignQuestionCard", () => {
  it("shows the question, the about eyebrow, and why", () => {
    const wrapper = mountCard();
    expect(wrapper.text()).toContain("Does Ravishin survive the parley?");
    expect(wrapper.text()).toContain("about The parley");
    expect(wrapper.text()).toContain("The next beat depends on whether Ravishin lives.");
  });

  it("omits the about eyebrow when the question is about the quest as a whole", () => {
    const wrapper = mountCard(null);
    expect(wrapper.text()).not.toContain("about ");
  });

  it("emits update:selection with the option key when an option is picked", async () => {
    const wrapper = mountCard();
    await wrapper.get('button[aria-label="Killed"]').trigger("click");

    const emitted = wrapper.emitted("update:selection");
    expect(emitted).toBeTruthy();
    expect(emitted![emitted!.length - 1]).toEqual([{ optionKey: "a", freeText: "" }]);
  });

  it("clears the selected option when free text is typed", async () => {
    const wrapper = mountCard();
    await wrapper.get('button[aria-label="Killed"]').trigger("click");
    await wrapper.get("input").setValue("They fought to a draw");

    const emitted = wrapper.emitted("update:selection")!;
    expect(emitted[emitted.length - 1]).toEqual([{ optionKey: null, freeText: "They fought to a draw" }]);

    // Visually cleared too — the "Killed" toggle drops its active styling.
    const killedButton = wrapper.get('button[aria-label="Killed"]');
    expect(killedButton.classes()).not.toContain("border-primary");
  });
});
