import { useLowArt } from "@/composables/useLowArt";
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";

const m = vi.hoisted(() => ({ nook: undefined as unknown, start: vi.fn() }));
vi.mock("@/composables/bookNook/useShowNookAtPlace", async () => {
  const { ref } = await import("vue");
  return { useNookForPlace: () => ({ data: ref(m.nook) }) };
});
vi.mock("@/composables/bookNook/useStartNook", () => ({
  useStartNook: () => ({ starting: ref(false), startFromPicture: m.start }),
}));

import AtlasPlacePicture from "./AtlasPlacePicture.vue";
import type { Location } from "@/types/location.types";

const stubs = {
  BookNookPlayer: { template: "<div data-testid='player' />" },
  AppButton: {
    props: ["label", "to"],
    emits: ["click"],
    template: "<button :data-label='label' :data-to='to' @click=\"$emit('click')\">{{ label }}</button>",
  },
};
const place = (extra: Partial<Location>) =>
  ({ id: "p1", name: "The Stag", image_url: null, book_nook_id: null, ...extra }) as Location;
const mountPicture = (location: Location) => mount(AtlasPlacePicture, { props: { location }, global: { stubs } });

beforeEach(() => {
  vi.clearAllMocks();
  m.nook = undefined;
});

describe("AtlasPlacePicture", () => {
  it("shows nothing for a place with no picture", () => {
    expect(mountPicture(place({})).find("[data-testid=place-picture]").exists()).toBe(false);
  });

  it("offers Bring it to life on a still, starting from this place", async () => {
    const loc = place({ image_url: "https://cdn.example.invalid/a.webp" });
    const v = mountPicture(loc);
    expect(v.find("img").exists()).toBe(true);
    await v.get("[data-label='Bring it to life']").trigger("click");
    expect(m.start).toHaveBeenCalledWith(loc);
  });

  it("plays the nook under a label, links to the studio and opens the Table screen", async () => {
    m.nook = { id: "n1", scene: {}, still_url: null };
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const v = mountPicture(place({ id: "p1", book_nook_id: "n1", image_url: "https://cdn.example.invalid/a.webp" }));
    expect(v.find("[data-testid=player]").exists()).toBe(true);
    expect(v.get("[data-testid=nook-label]").text()).toBe("Book Nook");
    expect(v.get("[data-label='Edit picture']").attributes("data-to")).toBe("/book-nook/n1");
    expect(v.find("[data-label='Bring it to life']").exists()).toBe(false);
    await v.get("[data-label='Table screen']").trigger("click");
    expect(open).toHaveBeenCalledWith("/locations/p1/table", "_blank", "noopener,noreferrer");
  });

  it("does not offer Bring it to life while the place's nook is still loading", () => {
    const v = mountPicture(place({ book_nook_id: "n1", image_url: "https://cdn.example.invalid/a.webp" }));
    expect(v.find("[data-label='Bring it to life']").exists()).toBe(false);
  });
});

describe("AtlasPlacePicture low art (#1179)", () => {
  afterEach(() => {
    useLowArt().setLowArt(false);
  });

  // Bug: low art hid Bring it to life, the only way to make a nook from a place's picture.
  it("draws no still but keeps Bring it to life in low art", async () => {
    useLowArt().setLowArt(true);
    const loc = place({ image_url: "https://cdn.example.invalid/a.webp" });
    const v = mountPicture(loc);
    expect(v.find("img").exists()).toBe(false);
    await v.get("[data-label='Bring it to life']").trigger("click");
    expect(m.start).toHaveBeenCalledWith(loc);
  });

  it("draws no still while the place's nook is still loading in low art", () => {
    useLowArt().setLowArt(true);
    const v = mountPicture(place({ book_nook_id: "n1", image_url: "https://cdn.example.invalid/a.webp" }));
    expect(v.find("img").exists()).toBe(false);
  });
});
