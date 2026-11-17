import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import NpcLoreSections from "./NpcLoreSections.vue";
import type { Npc } from "@/types/npc.types";

const stubs = { RichTextViewer: { props: ["content"], template: '<div data-testid="prose">{{ content }}</div>' } };

function full(overrides: Partial<Npc> = {}): Npc {
  return { id: "n1", appearance: null, personality: null, voice: null, backstory: null, ...overrides } as Npc;
}

describe("NpcLoreSections", () => {
  it("shows a loader, never an empty-lore claim, while only the list row is known (#999)", () => {
    const wrapper = mount(NpcLoreSections, { global: { stubs } });
    expect(wrapper.find('[data-testid="npc-lore-loading"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain("No lore recorded");
    expect(wrapper.find('[data-testid="prose"]').exists()).toBe(false);
  });

  it("renders the written sections once the full record has arrived", async () => {
    const wrapper = mount(NpcLoreSections, { global: { stubs } });
    await wrapper.setProps({ full: full({ appearance: "Tall.", backstory: "Born in Mirabar." }) });
    expect(wrapper.find('[data-testid="npc-lore-loading"]').exists()).toBe(false);
    expect(wrapper.findAll('[data-testid="prose"]').map((p) => p.text())).toEqual(["Tall.", "Born in Mirabar."]);
    expect(wrapper.text()).not.toContain("Personality");
  });

  // Bug caught: Voice missing from the read view, or a lone Voice still reading "No lore recorded".
  it("shows Voice when written and counts it as lore", () => {
    const wrapper = mount(NpcLoreSections, { props: { full: full({ voice: "Slow.\nSays 'hm' a lot." }) }, global: { stubs } });
    expect(wrapper.text()).toContain("Voice");
    expect(wrapper.text()).toContain("Says 'hm' a lot.");
    expect(wrapper.text()).not.toContain("No lore recorded");
  });

  it("hides the Voice heading when none is written", () => {
    const wrapper = mount(NpcLoreSections, { props: { full: full({ appearance: "Tall." }) }, global: { stubs } });
    expect(wrapper.text()).not.toContain("Voice");
  });

  it("says so only when the full record really has no lore", () => {
    const wrapper = mount(NpcLoreSections, { props: { full: full() }, global: { stubs } });
    expect(wrapper.text()).toContain("No lore recorded for this NPC.");
  });
});
