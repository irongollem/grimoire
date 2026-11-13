import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import PortraitOnRequest from "./PortraitOnRequest.vue";

const lightbox = { name: "ImageLightbox", props: ["src", "alt", "origin"], template: "<div data-test='lightbox' />" };
const mountIt = (src: string | null) => mount(PortraitOnRequest, { props: { src }, global: { stubs: { ImageLightbox: lightbox } } });

describe("PortraitOnRequest", () => {
  it("fetches nothing before the click: no img and no lightbox (the on-request portrait is fetched before anyone asks)", () => {
    const w = mountIt("https://x/p.webp");
    expect(w.find("button").exists()).toBe(true);
    expect(w.find("img").exists()).toBe(false);
    expect(w.find("[data-test=lightbox]").exists()).toBe(false);
  });

  it("renders nothing for a null src (a placeholder-only record shows a Portrait button)", () => {
    const w = mountIt(null);
    expect(w.find("button").exists()).toBe(false);
  });

  it("opens the lightbox with the record's picture on click", async () => {
    const w = mountIt("https://x/p.webp");
    await w.find("button").trigger("click");
    expect(w.findComponent(lightbox).props("src")).toBe("https://x/p.webp");
  });
});
