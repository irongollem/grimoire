// @vitest-environment jsdom
import { mount, config } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import NoticePinFace from "./NoticePinFace.vue";
import { face, goat, grell, sealed, focalImageStub } from "./fixtures";

// FocalImage measures with a ResizeObserver the test DOM lacks.
config.global.stubs = { ...config.global.stubs, FocalImage: focalImageStub };

describe("NoticePinFace", () => {
  it("sets a note's headline and body as live text", () => {
    const w = mount(NoticePinFace, { props: { face: goat } });
    expect(w.attributes("data-style")).toBe("note");
    expect(w.find(".nb-headline").text()).toBe("LOST: one goat");
    expect(w.find(".nb-body").text()).toContain("Answers to Gerald.");
  });

  it("prints a wanted poster: WANTED, the portrait, the name, what for and the reward", () => {
    const w = mount(NoticePinFace, { props: { face: grell } });
    expect(w.find(".nb-wanted").text()).toBe("Wanted");
    expect(w.find(".nb-portrait img").attributes("src")).toBe("https://example.invalid/grell.webp");
    expect(w.find(".nb-poster-name").text()).toBe("Grell Ashmantle");
    expect(w.find(".nb-poster-body").text()).toContain("burning of the miller's barn");
    expect(w.find(".nb-reward").text()).toBe("Reward: 50 gold crowns, paid at the reeve's hall");
  });

  it("leaves out a poster's portrait and reward when it has none", () => {
    const w = mount(NoticePinFace, { props: { face: face({ ...grell, image_url: null, reward: null }) } });
    expect(w.find(".nb-portrait").exists()).toBe(false);
    expect(w.find(".nb-reward").exists()).toBe(false);
  });

  it("shows a sealed letter's address and seal on the board, and its body only to the reader", () => {
    const onBoard = mount(NoticePinFace, { props: { face: sealed } });
    expect(onBoard.find(".nb-address").text()).toBe("To the brave souls who read this");
    expect(onBoard.find(".nb-seal").attributes("data-seal")).toBe("red");
    expect(onBoard.find(".nb-seal img").attributes("src")).toContain("seal-red");
    expect(onBoard.text()).not.toContain("Cinderfall");

    const reader = mount(NoticePinFace, { props: { face: sealed, mode: "reader" } });
    expect(reader.find(".nb-body").text()).toContain("The mine at Cinderfall has gone quiet");
  });

  it("uses the black seal when asked", () => {
    const w = mount(NoticePinFace, { props: { face: face({ ...sealed, seal: "black" }) } });
    expect(w.find(".nb-seal img").attributes("src")).toContain("seal-black");
  });

  it("falls back to a coloured disc when the seal art fails", async () => {
    const w = mount(NoticePinFace, { props: { face: sealed } });
    await w.find(".nb-seal img").trigger("error");
    expect(w.find(".nb-seal img").exists()).toBe(false);
    expect(w.find(".nb-seal").exists()).toBe(true);
  });

  it("captions a picture with its headline", () => {
    const w = mount(NoticePinFace, {
      props: { face: face({ id: "pin-map", style: "image", headline: "The old mill, from the road", image_url: "https://example.invalid/mill.webp" }) },
    });
    expect(w.find(".nb-picture img").attributes("src")).toBe("https://example.invalid/mill.webp");
    expect(w.find(".nb-caption").text()).toBe("The old mill, from the road");
  });

  it("marks reader mode, where nothing is clamped", () => {
    const w = mount(NoticePinFace, { props: { face: goat, mode: "reader" } });
    expect(w.classes()).toContain("is-reader");
    expect(w.attributes("data-mode")).toBe("reader");
  });
});
