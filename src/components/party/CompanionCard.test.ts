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
    // The empty portrait column goes too, so the name leads.
    expect(w.find('[data-testid="companion-portrait"]').exists()).toBe(false);
    expect(w.text()).toContain("Biscuit");
  });

  // Bug: a pet's passives are missing from the party tracker, though the DM
  // reads them there for every hero (maintainer, 16 Nov 2026).
  it("shows passive Perception from the companion's stat block", () => {
    const withBlock = { ...companion, ac: 12, speed: 30, stat_block: { str: 3, dex: 15, con: 10, int: 3, wis: 12, cha: 7, skills: { perception: "+3" } } } as unknown as Companion;
    const text = mount(CompanionCard, { props: { companion: withBlock }, global: { stubs: { RouterLink: true } } }).text();
    expect(text).toMatch(/Perception\s*13/);
    expect(text).toMatch(/Investigation\s*6/);
  });

  it("shows no passives for a companion without a stat block", () => {
    expect(mountCard().text()).not.toContain("Perception");
  });

  it("draws the portrait when low art is off", () => {
    expect(mountCard().find("img").attributes("src")).toBe("/biscuit.webp");
  });
});
