import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import MemorialCameo from "./MemorialCameo.vue";
import { useLowArt } from "@/composables/useLowArt";

const mountCameo = () =>
  mount(MemorialCameo, { props: { kind: "fallen", name: "Chicory", portraitUrl: "/chicory.webp", focalPoint: null } });

describe("MemorialCameo", () => {
  afterEach(() => {
    useLowArt().setLowArt(false);
  });

  // Bug: a fallen hero's cameo still draws the portrait in low art.
  it("draws the initial inside the oval, not the portrait, in low art", () => {
    useLowArt().setLowArt(true);
    const w = mountCameo();
    expect(w.find("img").exists()).toBe(false);
    expect(w.find(".cameo-initial").text()).toBe("C");
  });

  it("draws the portrait when low art is off", () => {
    expect(mountCameo().find("img").attributes("src")).toBe("/chicory.webp");
  });
});
