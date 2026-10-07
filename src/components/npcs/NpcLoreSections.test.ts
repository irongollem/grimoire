import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import NpcLoreSections from "./NpcLoreSections.vue";
import type { Npc } from "@/types/npc.types";

const stubs = { RichTextViewer: { props: ["content"], template: '<div data-testid="prose">{{ content }}</div>' } };

function full(overrides: Partial<Npc> = {}): Npc {
  return { id: "n1", appearance: null, personality: null, backstory: null, ...overrides } as Npc;
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

  it("says so only when the full record really has no lore", () => {
    const wrapper = mount(NpcLoreSections, { props: { full: full() }, global: { stubs } });
    expect(wrapper.text()).toContain("No lore recorded for this NPC.");
  });
});
