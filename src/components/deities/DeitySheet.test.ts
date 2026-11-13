import { mount, RouterLinkStub } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import DeitySheet from "./DeitySheet.vue";
import { useLowArt } from "@/composables/useLowArt";
import type { Deity, Pantheon } from "@/types/deity.types";

vi.mock("@/components/connections/ConnectionsSection.vue", () => ({ default: { template: "<div />" } }));

const deity = (overrides: Partial<Deity> = {}): Deity & { pantheon: Pick<Pantheon, "id" | "name"> | null } =>
  ({
    id: "d1",
    name: "Tyr",
    titles: "The Maimed God",
    alternate_names: [],
    pantheon_id: "p1",
    alignment: "Lawful Good",
    symbol: "A sword",
    symbol_image_url: "https://cdn.test/tyr-symbol.webp",
    portrait_url: "https://cdn.test/tyr.webp",
    portrait_focal_point: null,
    domains: ["War"],
    portfolio: null,
    description: null,
    tags: [],
    pantheon: { id: "p1", name: "Faerunian" },
    ...overrides,
  }) as never;

const mountSheet = (d = deity()) => mount(DeitySheet, { props: { deity: d }, global: { stubs: { RouterLink: RouterLinkStub, AiImageBadge: true } } });

describe("DeitySheet", () => {
  afterEach(() => {
    useLowArt().setLowArt(false);
  });

  it("keeps the portrait and the holy symbol picture with low art off", () => {
    expect(mountSheet().findAll("img").length).toBeGreaterThanOrEqual(2);
  });

  // Bug: the header reserved room for an alignment tab that is only drawn in low art.
  it("reserves no tab room in the header with low art off", () => {
    expect(mountSheet().find(".pr-10").exists()).toBe(false);
  });

  describe("in low art (#1179)", () => {
    // Bug: the sheet still downloads the portrait and the holy symbol although art is off.
    it("draws no picture, hangs the alignment tab and keeps the Portrait button", () => {
      useLowArt().setLowArt(true);
      const wrapper = mountSheet();
      expect(wrapper.find("img").exists()).toBe(false);
      expect(wrapper.findAll(".sr-only").some((e) => e.text() === "Alignment LG")).toBe(true);
      expect(wrapper.text()).toContain("Faerunian");
      expect(wrapper.text()).toContain("Portrait");
      expect(wrapper.find(".pr-10").exists()).toBe(true);
    });

    // Bug: a portrait button that opens a placeholder.
    it("shows no Portrait button when the deity has no portrait of its own", () => {
      useLowArt().setLowArt(true);
      expect(mountSheet(deity({ portrait_url: null })).text()).not.toContain("Portrait");
    });
  });
});
