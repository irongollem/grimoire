import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import RecentNpcsWidget from "./RecentNpcsWidget.vue";
import { useLowArt } from "@/composables/useLowArt";

vi.mock("@/composables/npcs/useNpcs", () => ({
  useNpcs: () => ({ data: ref([{ id: "n1", name: "Maera Thane", portrait_url: "/maera.webp", portrait_focal_point: null }]) }),
}));
vi.mock("@/composables/dashboard/useRecentNpcs", () => ({ useRecentNpcs: () => ({ recentIds: ref(["n1"]) }) }));

const mountWidget = () => mount(RecentNpcsWidget, { global: { stubs: { RouterLink: { template: "<a><slot /></a>" } } } });

describe("RecentNpcsWidget", () => {
  afterEach(() => {
    useLowArt().setLowArt(false);
  });

  // Bug: the recent-NPC strip still fetches portraits in low art.
  it("draws no portrait in low art and still names the NPC", () => {
    useLowArt().setLowArt(true);
    const w = mountWidget();
    expect(w.find("img").exists()).toBe(false);
    // The empty avatar circle goes too, so the name leads.
    expect(w.find(".rounded-full.overflow-hidden").exists()).toBe(false);
    expect(w.text()).toContain("Maera Thane");
  });

  it("draws the portrait when low art is off", () => {
    expect(mountWidget().find("img").attributes("src")).toBe("/maera.webp");
  });
});
