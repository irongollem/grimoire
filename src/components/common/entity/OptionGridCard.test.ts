import { afterEach, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import OptionGridCard from "./OptionGridCard.vue";
import { CARD_OVERLAY_ACTION } from "@/components/common/controls/appButtonVariants";
import { useLowArt } from "@/composables/useLowArt";

const stubs = { RouterLink: true, AiImageBadge: true };

function card(props: Record<string, unknown> = {}) {
  return mount(OptionGridCard, {
    props: { to: "/species/1", title: "Aasimar", placeholder: "/p.webp", imageUrl: "/a.webp", eyebrow: "Species", ...props },
    slots: { default: "<p>body</p>", foot: "<span>FOOT</span>" },
    global: { stubs },
  });
}

afterEach(() => {
  useLowArt().setLowArt(false);
});

describe("OptionGridCard in low art (#1179)", () => {
  // Bug: the picker loses its Select button or the chosen ring when the plate goes.
  it("keeps Select, the chosen ring and the check mark without a picture", () => {
    useLowArt().setLowArt(true);
    const w = card({ selectMode: true, selected: true });
    expect(w.find("img").exists()).toBe(false);
    expect(w.findAll("button").some((b) => b.text() === "Select")).toBe(true);
    expect(w.find("[data-art-free]").classes()).toContain("ring-primary/20");
    expect(w.text()).toContain("Species");
    expect(w.text()).toContain("FOOT");
  });

  // Bug: the Edit chip keeps its white-on-photo overlay style on a plain card.
  it("draws the Edit chip plain when art-free and as an overlay chip with a plate", () => {
    useLowArt().setLowArt(true);
    const plain = card({ editTo: "/species/1?edit=true", editLabel: "Edit species" });
    const plainClasses = plain.find("[aria-label='Edit species']").classes();
    useLowArt().setLowArt(false);
    const plated = card({ editTo: "/species/1?edit=true", editLabel: "Edit species" });
    const platedClasses = plated.find("[aria-label='Edit species']").classes();
        const overlayTokens = CARD_OVERLAY_ACTION.split(/\s+/);
    expect(overlayTokens.some((t) => platedClasses.includes(t))).toBe(true);
    expect(overlayTokens.some((t) => plainClasses.includes(t))).toBe(false);
  });

  // Bug: Vue casts an absent boolean prop to false, so every species card went art-free with low art off.
  it("with low art off and no plate prop, the card keeps its picture", () => {
    const w = card();
    expect(w.find("[data-art-free]").exists()).toBe(false);
    expect(w.findComponent({ name: "FocalImage" }).exists()).toBe(true);
  });

  // Bug: plate=false is ignored by the wrapper, so an archetype grows a placeholder plate.
  it("plate=false is art-free with low art off", () => {
    const w = card({ plate: false });
    expect(w.find("[data-art-free]").exists()).toBe(true);
    expect(w.find("img").exists()).toBe(false);
  });
});
