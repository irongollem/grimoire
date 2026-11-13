import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import FocalImage from "@/components/common/media/FocalImage.vue";
import { useLowArt } from "@/composables/useLowArt";
import EntityMobileCard from "./EntityMobileCard.vue";

const base = {
  to: "/npcs/1",
  title: "Treacle",
  subtitle: "Eldest spinner",
  imageUrl: "https://example.test/a.webp",
  placeholder: "/placeholder.webp",
  location: "The Spinning-Floor",
};

function mountCard(props: Record<string, unknown>) {
  return mount(EntityMobileCard, {
    props: { ...base, ...props },
    global: { stubs: { RouterLink: { template: "<a><slot /></a>" }, FocalImage: true } },
  });
}

afterEach(() => {
  useLowArt().setLowArt(false);
});

describe("EntityMobileCard low art", () => {
  it("a phone row still downloads a thumbnail in low art", () => {
    useLowArt().setLowArt(true);
    const w = mountCard({ layout: "rows" });
    expect(w.find("img").exists()).toBe(false);
    expect(w.findComponent(FocalImage).exists()).toBe(false);
    expect(w.text()).toContain("Treacle");
    expect(w.text()).toContain("Eldest spinner");
    expect(w.text()).toContain("The Spinning-Floor");
  });

  it("a low-art grid card loses its tab or draws a picture", () => {
    useLowArt().setLowArt(true);
    const w = mountCard({ layout: "grid", tab: { text: "5" }, stat: "AC 15 · HP 110" });
    expect(w.text()).toContain("5");
    expect(w.text()).toContain("AC 15 · HP 110");
    expect(w.find("img").exists()).toBe(false);
    expect(w.findComponent(FocalImage).exists()).toBe(false);
  });

  it("with low art off the picture is still drawn, marked as a record's", () => {
    const w = mountCard({ layout: "rows" });
    expect(w.findComponent(FocalImage).attributes("record")).toBeDefined();
  });
});
