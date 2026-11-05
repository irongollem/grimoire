import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { shallowRef } from "vue";

const current = shallowRef<unknown>(null);
const opened = vi.hoisted(() => ({ calls: [] as unknown[] }));
vi.mock("@/composables/bookNook/usePlaceNook", () => ({
  usePlaceNook: () => ({ nook: current }),
}));
vi.mock("@/components/common/media/FocalImage.vue", () => ({
  default: { props: ["src"], template: '<img data-still :src="src" />' },
}));

import PlaceNookPicture from "./PlaceNookPicture.vue";

const Player = { name: "BookNookPlayer", props: ["scene", "still", "screen"], template: "<div data-nook-player />" };
const Fullscreen = {
  name: "BookNookFullscreen",
  props: ["scene", "still"],
  setup(_: unknown, { expose }: { expose: (e: object) => void }) {
    expose({ open: (origin: unknown) => opened.calls.push(origin) });
    return () => null;
  },
};

const place = { id: "l1", name: "Sugarwell", image_url: "https://cdn.test/s.webp", book_nook_id: "n1" };
const nook = { id: "n1", scene: { title: "Sugarwell" }, still_url: "https://cdn.test/nook-still.webp" };

function mountPicture(over: Record<string, unknown> = {}) {
  return mount(PlaceNookPicture, {
    props: { place, ...over },
    global: { stubs: { BookNookPlayer: Player, BookNookFullscreen: Fullscreen } },
  });
}

describe("PlaceNookPicture", () => {
  it("shows the living picture, not the still, when the place has a nook (wide for the hero, tall for the thumb)", () => {
    current.value = nook;
    const hero = mountPicture();
    expect(hero.findComponent(Player).props("screen")).toBe("wide");
    expect(hero.find("[data-still]").exists()).toBe(false);
    expect(mountPicture({ variant: "thumb" }).findComponent(Player).props("screen")).toBe("tall");
  });

  it("opens the nook full screen synchronously inside the click, and does not open the still lightbox", () => {
    current.value = nook;
    opened.calls = [];
    const w = mountPicture();
    // No await: a motion prompt needs the tap itself. A deferred open() would leave this at zero.
    void w.find("button").trigger("click");
    expect(opened.calls).toHaveLength(1);
    expect(w.emitted("lightbox")).toBeUndefined();
  });

  it("keeps the still and the lightbox for a place with no nook", async () => {
    current.value = null;
    opened.calls = [];
    const w = mountPicture({ place: { ...place, book_nook_id: null } });
    expect(w.find("[data-still]").exists()).toBe(true);
    expect(w.findComponent(Player).exists()).toBe(false);
    await w.find("button").trigger("click");
    expect(w.emitted("lightbox")).toEqual([[place.image_url]]);
    expect(opened.calls).toHaveLength(0);
  });

  it("shows the still when the nook is hidden from the player (the rpc answered nothing)", async () => {
    current.value = null;
    const w = mountPicture(); // book_nook_id set, but no nook came back
    await flushPromises();
    expect(w.findComponent(Player).exists()).toBe(false);
    expect(w.find("[data-still]").exists()).toBe(true);
  });

  it("labels the button by the place and never names the studio", () => {
    current.value = nook;
    const w = mountPicture();
    expect(w.find("button").attributes("aria-label")).toBe("Open Sugarwell full screen");
    expect(w.text()).not.toContain("Book Nook");
  });

  it("draws no empty button for a place with neither a nook nor a picture", () => {
    current.value = null;
    expect(mountPicture({ place: { ...place, image_url: null, book_nook_id: null } }).find("button").exists()).toBe(false);
  });
});
