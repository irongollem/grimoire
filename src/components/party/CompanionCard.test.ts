import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import CompanionCard from "./CompanionCard.vue";
import { useLowArt } from "@/composables/useLowArt";
import type { Companion } from "@/types/companion.types";

vi.mock("@/composables/encounters/useCompanions", () => ({ useUpdateCompanion: () => ({ mutateAsync: vi.fn() }) }));
vi.mock("@/composables/rules/useRuleset", () => ({ useTableRuleset: () => ({ ruleset: { value: "2014" } }) }));

const companion = {
  id: "c1",
  name: "Biscuit",
  companion_type: "pet",
  portrait_url: "/biscuit.webp",
  portrait_focal_point: null,
  current_hp: 5,
  max_hp: 5,
  conditions: [],
  combat_ready: true,
} as unknown as Companion;

const mountCard = () => mount(CompanionCard, { props: { companion }, global: { stubs: { RouterLink: true } } });

describe("CompanionCard", () => {
  afterEach(() => {
    useLowArt().setLowArt(false);
  });

  // Bug: a companion's token portrait is still fetched in low art.
  it("draws no portrait in low art and still names the companion", () => {
    useLowArt().setLowArt(true);
    const w = mountCard();
    expect(w.find("img").exists()).toBe(false);
    // The empty avatar circle goes too, so the name leads.
    expect(w.find(".h-8.w-8").exists()).toBe(false);
    expect(w.text()).toContain("Biscuit");
  });

  it("draws the portrait when low art is off", () => {
    expect(mountCard().find("img").attributes("src")).toBe("/biscuit.webp");
  });
});
