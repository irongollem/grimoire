// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { computed } from "vue";
import { shallowMount } from "@vue/test-utils";

const wanted = vi.hoisted(() => ({ fn: null as null | (() => boolean) }));
vi.mock("@/ai/ask/askSceneMentions", () => ({
  useAskSceneMentions: (enabled: () => boolean) => {
    wanted.fn = enabled;
    return { mentionItems: computed(() => [{ id: "n1", label: "Mara", entityType: "npc" }]) };
  },
}));
vi.mock("@/composables/items/useItemIndex", () => ({ useItemIndex: () => ({ data: computed(() => [{ id: "i1", name: "Rope" }]) }) }));

import AskConceptBox from "./AskConceptBox.vue";
import MentionTextarea from "@/components/common/controls/MentionTextarea.vue";

const box = (mentions: "items" | "entities" | undefined, disabled = false) =>
  shallowMount(AskConceptBox, { props: { field: { label: "Describe it", placeholder: "…", ...(mentions ? { mentions } : {}) }, modelValue: "", noun: "track", disabled } });

describe("AskConceptBox mentions", () => {
  // Bug caught: an entities box getting no mention list, so @ offered nothing.
  it("an entities box offers the campaign's people, places and factions, and says so", () => {
    const w = box("entities");
    expect(w.findComponent(MentionTextarea).props("items")).toEqual([{ id: "n1", label: "Mara", entityType: "npc" }]);
    expect(w.text()).toContain("Type @ to include a character, creature, place or faction");
  });

  // Bug caught: the entities read running for a card that does not take them, or while the box is disabled (egress for nothing).
  it("reads the entities only for an entities box that is not disabled", () => {
    box("entities");
    expect(wanted.fn?.()).toBe(true);
    box("entities", true);
    expect(wanted.fn?.()).toBe(false);
    box("items");
    expect(wanted.fn?.()).toBe(false);
  });

  it("an items box still offers the catalogue's items", () => {
    expect(box("items").findComponent(MentionTextarea).props("items")).toEqual([{ id: "i1", label: "Rope" }]);
  });
});
