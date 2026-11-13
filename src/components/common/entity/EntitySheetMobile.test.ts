import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useLowArt } from "@/composables/useLowArt";
import EntitySheetMobile from "./EntitySheetMobile.vue";

vi.mock("vue-router", () => ({ useRouter: () => ({ back: vi.fn(), push: vi.fn() }) }));

const stubs = {
  FocalImage: { name: "FocalImage", template: "<div data-test='focal' />" },
  PortraitOnRequest: { name: "PortraitOnRequest", props: ["src"], template: "<button data-test='portrait' />" },
  MobileSheet: true,
};
const mountSheet = (image: string | null) =>
  mount(EntitySheetMobile, {
    props: { backTo: "/x", name: "Owlbear", subtitle: "Large monstrosity", image, placeholder: "/ph.webp" },
    slots: { pills: "<span>pill</span>" },
    global: { stubs },
  });

afterEach(() => {
  useLowArt().setLowArt(false);
});

describe("EntitySheetMobile in low art", () => {
  it("draws no 20rem hero and sets the name in the flow (the phone sheet still loads a hero in low art)", () => {
    useLowArt().setLowArt(true);
    const w = mountSheet("https://x/p.webp");
    expect(w.find("[data-test=focal]").exists()).toBe(false);
    expect(w.find("img").exists()).toBe(false);
    expect(w.find("h2").text()).toBe("Owlbear");
    expect(w.find("h2").classes()).not.toContain("text-white");
    expect(w.find("h1").classes()).toContain("opacity-100");
    expect(w.find("[data-test=portrait]").exists()).toBe(true);
  });

  it("passes a null picture through so a placeholder-only record has no Portrait button", () => {
    useLowArt().setLowArt(true);
    const w = mountSheet(null);
    expect(w.findComponent(stubs.PortraitOnRequest).props("src")).toBeNull();
  });

  it("keeps the hero when low art is off", () => {
    const w = mountSheet("https://x/p.webp");
    expect(w.find("[data-test=focal]").exists()).toBe(true);
    expect(w.find("[data-test=portrait]").exists()).toBe(false);
  });
});
