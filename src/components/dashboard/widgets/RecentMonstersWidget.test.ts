import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import RecentMonstersWidget from "./RecentMonstersWidget.vue";
import { useLowArt } from "@/composables/useLowArt";

vi.mock("@/composables/encounters/useDiscoveredMonsters", () => ({
  useCampaignDiscoveries: () => ({
    data: ref([{ monster_id: "m1", library_monster_id: null, discovered_at: "2026-11-01T10:00:00Z" }]),
  }),
}));
vi.mock("@/composables/monsters/useMonstersByIds", () => ({
  useMonstersByIds: () => ({ data: ref(new Map([["m1", { id: "m1", name: "Owlbear", image_url: "/owlbear.webp" }]])) }),
}));

const mountWidget = () => mount(RecentMonstersWidget, { global: { stubs: { RouterLink: { template: "<a><slot /></a>" } } } });

describe("RecentMonstersWidget", () => {
  afterEach(() => {
    useLowArt().setLowArt(false);
  });

  // Bug: discovered monsters still show their art in low art.
  it("draws no picture in low art and still names the monster", () => {
    useLowArt().setLowArt(true);
    const w = mountWidget();
    expect(w.find("img").exists()).toBe(false);
    // The empty avatar circle goes too, so the name leads.
    expect(w.find(".rounded-full.overflow-hidden").exists()).toBe(false);
    expect(w.text()).toContain("Owlbear");
  });

  it("draws the picture when low art is off", () => {
    expect(mountWidget().find("img").attributes("src")).toBe("/owlbear.webp");
  });
});
