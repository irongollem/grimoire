// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, ref } from "vue";

const h = await vi.hoisted(async () => {
  const { ref: vueRef } = await import("vue");
  return { places: {} as Record<string, unknown>, id: vueRef("a") };
});

vi.mock("@/composables/locations/useLocations", async () => {
  const { computed, unref } = await import("vue");
  return {
    useLocation: (id: unknown) => ({ data: computed(() => (unref(id as string) ? h.places[unref(id as string)] : undefined)) }),
  };
});
vi.mock("@/composables/bookNook/useBookNooks", () => ({
  useBookNook: () => ({ data: ref({ scene: { title: "Hearth" }, still_url: null }) }),
}));

import MapTablePicture from "./MapTablePicture.vue";

const Player = defineComponent({ name: "BookNookPlayer", props: ["scene", "still", "screen", "fullscreen"], template: "<div data-testid='player' />" });

function mountIt() {
  return mount(MapTablePicture, { props: { placeId: h.id.value }, global: { stubs: { BookNookPlayer: Player } } });
}

describe("MapTablePicture", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    h.places = {
      a: { id: "a", name: "The Hearth", parent_id: "inn", book_nook_id: "n1" },
      b: { id: "b", name: "The Cellar", parent_id: "inn", book_nook_id: "n1" },
      inn: { id: "inn", name: "The Gilded Pig", parent_id: null },
    };
    h.id.value = "a";
  });
  afterEach(() => vi.useRealTimers());

  it("plays the wide nook with no frame (the TV breathes)", () => {
    const p = mountIt().getComponent(Player);
    expect(p.props("screen")).toBe("wide");
    expect(p.props("fullscreen")).toBeFalsy();
  });

  it("lays the place's name and its parent over the picture on arrival", () => {
    const w = mountIt();
    expect(w.get("[data-testid='arrival-name']").text()).toBe("The Hearth");
    expect(w.get("[data-testid='arrival-parent']").text()).toBe("The Gilded Pig");
  });

  // Bug: a title that never leaves sits over the painting for the whole session.
  it("takes the name away after five seconds and leaves the picture alone", async () => {
    const w = mountIt();
    vi.advanceTimersByTime(4900);
    await flushPromises();
    expect(w.find("[data-testid='arrival-name']").exists()).toBe(true);
    vi.advanceTimersByTime(200);
    await flushPromises();
    expect(w.find("[data-testid='arrival-name']").exists()).toBe(false);
    expect(w.find("[data-testid='player']").exists()).toBe(true);
  });

  // Bug: the party walks to the next place and the title stays gone because the first hold already ran out.
  it("replays the title when the party moves to another place", async () => {
    const w = mountIt();
    vi.advanceTimersByTime(6000);
    await flushPromises();
    expect(w.find("[data-testid='arrival-name']").exists()).toBe(false);
    await w.setProps({ placeId: "b" });
    expect(w.get("[data-testid='arrival-name']").text()).toBe("The Cellar");
  });
});
