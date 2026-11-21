import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import SoloShown from "./SoloShown.vue";
import type { Shown } from "@edge-shared/agent/show.ts";

const ID = "11111111-2222-4333-8444-555555555555";
const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/:rest(.*)*", component: { template: "<div />" } }] });
const draw = (shown: Shown) => mount(SoloShown, { props: { shown }, global: { plugins: [router] } });
const place = (over: Partial<Extract<Shown, { kind: "place" }>> = {}): Shown => ({ kind: "place", id: ID, title: "The Salt Hall", url: null, hasMap: false, hasNook: false, ...over });

describe("SoloShown, a place", () => {
  // Bug caught: a place handed over that the player cannot get to (no way from the story to the place's own view),
  // or a link to the wrong place.
  it("links to the player's view of that place", () => {
    const link = draw(place()).find("a");
    expect(link.text()).toContain("Open in your places");
    expect(link.attributes("href")).toBe(`/play/atlas?open=${ID}`);
  });

  // Bug caught: a place with no picture drawing nothing (the card vanishing with its link).
  it("still draws the card with the name when the place has no picture", () => {
    const wrapper = draw(place());
    expect(wrapper.find('[data-testid="solo-shown-place"]').text()).toContain("The Salt Hall");
    expect(wrapper.find("img").exists()).toBe(false);
  });

  it("keeps the picture when the place has one", () => {
    expect(draw(place({ url: "https://assets.example/s.webp" })).find("img").attributes("src")).toBe("https://assets.example/s.webp");
  });

  // Bug caught: the hints claiming a map or a nook the player was not given, or hiding one they were.
  it("hints at a map and a nook only when the place brings them", () => {
    expect(draw(place()).text()).not.toMatch(/map|nook/);
    expect(draw(place({ hasMap: true })).text()).toContain("with a map");
    expect(draw(place({ hasMap: true })).text()).not.toContain("nook");
    expect(draw(place({ hasNook: true })).text()).toContain("with a nook");
    expect(draw(place({ hasMap: true, hasNook: true })).text()).toContain("with a map and a nook");
  });
});
