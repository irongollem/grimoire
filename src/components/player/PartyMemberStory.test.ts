import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";

const state = vi.hoisted(() => ({ world: undefined as unknown }));
vi.mock("@/composables/canon/usePlayerCanon", async () => {
  const { computed: c } = await import("vue");
  return { usePlayerCanon: () => ({ world: c(() => state.world) }) };
});

import PartyMemberStory from "./PartyMemberStory.vue";

const world = (backstories: unknown[]) => ({ onlyMine: [], known: [], lore: [], backstories });
const story = (memberId: string, titles: string[]) => ({
  entry: { id: `e-${memberId}` }, memberId, latestDmAt: null,
  passages: titles.map((title, i) => ({ id: `${memberId}-${i}`, title, body: null })),
});
const mountStory = (memberId: string) => mount(PartyMemberStory, { props: { memberId }, global: { stubs: { RichTextViewer: true } } });

describe("PartyMemberStory", () => {
  // Bug caught: another character's passages shown under the wrong party member.
  it("shows the passages told to this viewer of that character, and no other's", () => {
    state.world = world([story("m2", ["The ferryman's coin"]), story("m3", ["Not theirs"])]);
    const w = mountStory("m2");
    expect(w.text()).toContain("The ferryman's coin");
    expect(w.text()).not.toContain("Not theirs");
  });

  // Bug caught: an empty "Their story so far" heading on every character whose backstory was never shared with the viewer.
  it("draws nothing for a character whose backstory was not shared, or has nothing told", () => {
    state.world = world([story("m3", ["Elsewhere"]), story("m2", [])]);
    expect(mountStory("m2").find("[data-testid=member-story]").exists()).toBe(false);
    expect(mountStory("m9").find("[data-testid=member-story]").exists()).toBe(false);
    state.world = undefined;
    expect(mountStory("m2").find("[data-testid=member-story]").exists()).toBe(false);
  });
});
