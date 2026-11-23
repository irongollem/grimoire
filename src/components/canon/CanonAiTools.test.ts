import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";

const state = vi.hoisted(() => ({ aiEnabled: true }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ get isAiEnabled() { return state.aiEnabled; } }) }));

import CanonAiTools from "./CanonAiTools.vue";

const mountIt = () => mount(CanonAiTools, { global: { stubs: { ShapeTheWorld: { template: "<div data-testid='walk' />" }, CanonReadThrough: { template: "<div data-testid='read' />" } } } });

describe("CanonAiTools", () => {
  // Bug caught: the tools showed on a campaign with AI off, offering a spend that can never start.
  it("renders nothing when AI is off for the campaign", () => {
    state.aiEnabled = false;
    expect(mountIt().html()).toBe("<!--v-if-->");
    state.aiEnabled = true;
  });

  it("holds Read it through, and opens and closes the Shape the world walk", async () => {
    const w = mountIt();
    expect(w.find("[data-testid=read]").exists()).toBe(true);
    expect(w.find("[data-testid=walk]").exists()).toBe(false);
    const button = () => w.findAll("button").find((b) => b.text() === "Shape the world")!;
    await button().trigger("click");
    expect(w.find("[data-testid=walk]").exists()).toBe(true);
    await button().trigger("click");
    expect(w.find("[data-testid=walk]").exists()).toBe(false);
  });
});
