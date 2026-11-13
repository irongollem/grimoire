import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import DeathSavesWidget from "./DeathSavesWidget.vue";
import { useLowArt } from "@/composables/useLowArt";

vi.mock("@/composables/party/useActiveParty", () => ({
  useActiveParty: () => ({
    data: ref([
      {
        id: "p1",
        name: "Mira",
        portrait_url: "/mira.webp",
        portrait_focal_point: null,
        current_hp: 0,
        death_save_successes: 1,
        death_save_failures: 1,
      },
    ]),
  }),
}));

const mountWidget = () => mount(DeathSavesWidget, { global: { stubs: { RouterLink: { template: "<a><slot /></a>" } } } });

describe("DeathSavesWidget", () => {
  afterEach(() => {
    useLowArt().setLowArt(false);
  });

  // Bug: the death-saves alert still draws the hero's portrait in low art.
  it("draws no portrait in low art and still names the hero", () => {
    useLowArt().setLowArt(true);
    const w = mountWidget();
    expect(w.find("img").exists()).toBe(false);
    // The empty avatar circle goes too, so the name leads.
    expect(w.find(".rounded-full.overflow-hidden").exists()).toBe(false);
    expect(w.text()).toContain("Mira");
  });

  it("draws the portrait when low art is off", () => {
    expect(mountWidget().find("img").attributes("src")).toBe("/mira.webp");
  });
});
