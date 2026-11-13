import { afterEach, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { h } from "vue";
import EntityGridCard from "./EntityGridCard.vue";
import FocalImage from "@/components/common/media/FocalImage.vue";
import { useLowArt } from "@/composables/useLowArt";

const stubs = { RouterLink: { props: ["to"], template: "<a :href=\"to\"><slot /></a>" } };

function card(props: Record<string, unknown> = {}, slots: Record<string, unknown> = {}) {
  return mount(EntityGridCard, {
    props: { to: "/x/1", title: "Treacle", placeholder: "/p.webp", imageUrl: "/a.webp", ...props },
    slots: slots as never,
    global: { stubs: { ...stubs, FocalImage: true, AiImageBadge: true } },
  });
}

afterEach(() => {
  useLowArt().setLowArt(false);
});

describe("EntityGridCard", () => {
  // Bug: a low-art viewer gets the portrait card, or loses the Learn button.
  it("low art draws the catalogue entry: title, tab and overlay, no picture, no footer strip", () => {
    useLowArt().setLowArt(true);
    const w = card(
      { eyebrow: "Necromancy", tab: { text: "3", label: "Level" }, badgeText: "Friendly" },
      {
        "image-overlay": () => h("button", "Learn"),
        "image-footer": () => h("span", "FOOTER-NAME"),
      },
    );
    expect(w.find("img").exists()).toBe(false);
    expect(w.findComponent(FocalImage).exists()).toBe(false);
    expect(w.find("h3").text()).toBe("Treacle");
    expect(w.text()).toContain("Necromancy");
    expect(w.find("[aria-label='Level 3']").exists()).toBe(true);
    expect(w.text()).toContain("Learn");
    expect(w.text()).not.toContain("FOOTER-NAME");
    // The tab already carries the value, so the foot label is not repeated.
    expect(w.text()).not.toContain("Friendly");
  });

  it("low art puts the badge at the foot when there is no tab", () => {
    useLowArt().setLowArt(true);
    expect(card({ badgeText: "Friendly" }).text()).toContain("Friendly");
  });

  // Bug: a feat card grows a placeholder plate.
  it("plate=false is art-free even with low art off", () => {
    const w = card({ plate: false, placeholder: undefined, imageUrl: null });
    expect(w.findComponent(FocalImage).exists()).toBe(false);
    expect(w.find("[data-art-free]").exists()).toBe(true);
    expect(w.find("h3").text()).toBe("Treacle");
  });

  // Bug: a list that skips its own title in art-free mode gets none when art is on.
  it("with art, the plate renders a record picture and the body is told artFree=false", () => {
    let seen: boolean | null = null;
    const w = card({ eyebrow: "Nope" }, { body: (p: { artFree: boolean }) => { seen = p.artFree; return h("i", "b"); } });
    const img = w.findComponent(FocalImage);
    expect(img.exists()).toBe(true);
    expect(img.props("record")).toBe(true);
    expect(seen).toBe(false);
    expect(w.find("h3").exists()).toBe(false);
    expect(w.text()).not.toContain("Nope");
    expect(w.find("[data-art-free]").exists()).toBe(false);
  });

  it("the art-free body is told artFree=true", () => {
    useLowArt().setLowArt(true);
    let seen: boolean | null = null;
    card({}, { body: (p: { artFree: boolean }) => { seen = p.artFree; return h("i", "b"); } });
    expect(seen).toBe(true);
  });

  // Bug: the actions slot sits under the whole-card link and cannot be clicked.
  it("art-free actions sit in a z-10 wrapper above the card link", () => {
    useLowArt().setLowArt(true);
    const w = card({}, { "actions-end": () => h("button", { id: "act" }, "Reveal") });
    expect(w.find("#act").element.parentElement?.className).toContain("z-10");
    expect(w.find("a").attributes("href")).toBe("/x/1");
  });
});
