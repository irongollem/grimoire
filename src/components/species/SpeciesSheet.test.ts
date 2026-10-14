import { describe, it, expect, vi } from "vitest";
import { shallowMount } from "@vue/test-utils";
import SpeciesSheet from "./SpeciesSheet.vue";
import type { Species } from "@/types/species.types";

vi.mock("vue-router", () => ({ useRoute: () => ({ path: "/species" }), useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/composables/library/useSourceTitles", async () => {
  const { sourceLabel } = await import("@/lib/library/sourceLabel");
  const titles = new Map<string, string>();
  return {
    useSourceTitles: () => ({ labelFor: (s: string | null | undefined, t?: string | null) => sourceLabel(s, t, titles) }),
  };
});
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: vi.fn() }) }));
vi.mock("@/composables/rules/useSpecies", () => ({ useDeleteSpecies: () => ({ mutate: vi.fn() }) }));

const stubs = { FocalImage: true, RichTextViewer: true, AppButton: true };

function species(overrides: Partial<Species>): Species {
  return {
    id: "s1", user_id: "u1", campaign_id: null, name: "Darakhul", description: null,
    size: null, avg_height: null, avg_weight: null, speed: null,
    ability_score_increases: null, traits: [], languages: ["Common"], tags: [], source: null,
    subraces: null, image_url: null, focal_point: null, is_shapeshifter: false,
    granted_spells: [], created_at: "", updated_at: "",
    ...overrides,
  } as Species;
}

const darakhul = species({
  subraces: [
    { name: "Dwarf Heritage", description: "", traits: [], size: "medium", speed: { walk: 25 }, languages: ["Dwarvish"] },
    { name: "Plain Heritage", description: "", traits: [], speed: { walk: 30 } },
  ],
});

describe("SpeciesSheet subrace stats", () => {
  it("says size and speed come from the subrace when the species leaves them open", () => {
    const text = shallowMount(SpeciesSheet, { props: { species: darakhul }, global: { stubs } }).text();
    expect(text).toContain("Size by subrace");
    expect(text).toContain("Speed by subrace");
  });

  it("shows each subrace's own size, speed and extra languages", () => {
    const text = shallowMount(SpeciesSheet, { props: { species: darakhul }, global: { stubs } }).text();
    expect(text).toContain("Medium");
    expect(text).toContain("Walk 25ft");
    expect(text).toContain("Lang: Dwarvish");
  });

  it("shows no by-subrace note when the species states its own size and speed", () => {
    const own = species({ size: "medium", speed: { walk: 30 }, subraces: [{ name: "A", description: "", traits: [] }] });
    const text = shallowMount(SpeciesSheet, { props: { species: own }, global: { stubs } }).text();
    expect(text).not.toContain("by subrace");
    expect(text).toContain("Walk 30ft");
  });
});
