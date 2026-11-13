import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { useLowArt } from "@/composables/useLowArt";
import SheetThumb from "./SheetThumb.vue";

const props = { src: "https://x/a.webp", alt: "Elf" };
const mountThumb = () => mount(SheetThumb, { props, global: { stubs: { AiImageBadge: true } } });

describe("SheetThumb", () => {
  afterEach(() => useLowArt().setLowArt(false));

  // Bug: a sheet in low art keeps an empty 7 rem box or still downloads the thumbnail.
  it("low art: no picture and no box", () => {
    useLowArt().setLowArt(true);
    const w = mountThumb();
    expect(w.find("img").exists()).toBe(false);
    expect(w.find(".w-28").exists()).toBe(false);
  });

  it("art on: the record picture in its box", () => {
    const w = mountThumb();
    expect(w.find(".w-28").exists()).toBe(true);
    expect(w.find("img").attributes("src")).toContain("a_w400");
  });

  it("art on, no picture: the fallback slot (a class's initial)", () => {
    const w = mount(SheetThumb, { props: { src: null, alt: "Elf" }, slots: { fallback: "<span>E</span>" } });
    expect(w.text()).toBe("E");
  });
});
