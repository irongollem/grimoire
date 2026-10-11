import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import QuestDesignTreePreview from "./QuestDesignTreePreview.vue";
import type { QuestDesignTree, QuestDesignDiff } from "@/lib/quests/designer";

const tree: QuestDesignTree = {
  title: "The Silent Crypt",
  summary: "Something stirs beneath the old chapel.",
  beats: [
    { key: "b1", title: "Enter the crypt", dm_content: "The party finds a sealed door.", kind: "neutral" },
    { key: "b2", title: "Killed Ravishin", dm_content: "Ravishin falls in single combat.", kind: "combat" },
    { key: "b3", title: "Came to terms", dm_content: "Ravishin agrees to a truce.", kind: "social" },
  ],
  routes: [
    { from: "b1", to: "b2" },
    { from: "b1", to: "b3" },
  ],
  objectives: [
    { description: "Find the ledger", raised_by: "b1" },
    { description: "Confront Ravishin", raised_by: "b2" },
  ],
  tags: ["dungeon"],
};

const diff: QuestDesignDiff = {
  beats: { b1: "unchanged", b2: "added", b3: "changed" },
  removedBeatTitles: ["The old ending"],
  objectivesAdded: [],
  objectivesRemoved: [],
};

function mountPreview() {
  return mount(QuestDesignTreePreview, {
    props: { tree, diff, entities: [{ kind: "npc", name: "Ravishin", id: "npc-1" }] },
    global: { stubs: { GeneratedEntityChips: true } },
  });
}

describe("QuestDesignTreePreview", () => {
  it("numbers the beats in order and shows each kind chip", () => {
    const wrapper = mountPreview();
    const text = wrapper.text();
    expect(text).toContain("1.");
    expect(text).toContain("2.");
    expect(text).toContain("3.");
    expect(text).toContain("neutral");
    expect(text).toContain("combat");
    expect(text).toContain("social");
  });

  it("shows a change badge only for added/changed beats, from the diff", () => {
    const wrapper = mountPreview();
    const items = wrapper.findAll("li");
    const first = items[0]!.text();
    const second = items[1]!.text();
    const third = items[2]!.text();
    expect(first).not.toContain("new");
    expect(first).not.toContain("changed");
    expect(second).toContain("new");
    expect(third).toContain("changed");
  });

  it("renders the fork under the opening beat", () => {
    const wrapper = mountPreview();
    expect(wrapper.text()).toContain("Killed Ravishin / Came to terms");
  });

  it("lists removed beats once, under the list", () => {
    const wrapper = mountPreview();
    expect(wrapper.text()).toContain("Removed: The old ending");
  });

  it("marks objectives dormant/pending by which beat raises them", () => {
    const wrapper = mountPreview();
    const objectiveItems = wrapper.findAll("ul li");
    expect(objectiveItems[0]!.text()).toContain("Find the ledger");
    expect(objectiveItems[0]!.find(".sr-only").text()).toBe("Open");
    expect(objectiveItems[1]!.text()).toContain("Confront Ravishin");
    expect(objectiveItems[1]!.find(".sr-only").text()).toBe("Not yet raised");
  });
});
