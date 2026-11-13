import { afterEach, describe, it, expect, vi, beforeEach } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { shallowMount } from "@vue/test-utils";
import SpeciesSheet from "./SpeciesSheet.vue";
import FocalImage from "@/components/common/media/FocalImage.vue";
import { useLowArt } from "@/composables/useLowArt";
import type { Species } from "@/types/species.types";

const mocks = vi.hoisted(() => ({ push: vi.fn(), del: vi.fn(), confirm: vi.fn() }));
vi.mock("vue-router", () => ({ useRoute: () => ({ path: "/species", query: {} }), useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/composables/library/useSourceTitles", async () => {
  const { sourceLabel } = await import("@/lib/library/sourceLabel");
  const titles = new Map<string, string>();
  return {
    useSourceTitles: () => ({ labelFor: (s: string | null | undefined, t?: string | null) => sourceLabel(s, t, titles) }),
  };
});
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));
vi.mock("@/composables/rules/useSpecies", () => ({ useDeleteSpecies: () => ({ mutate: vi.fn(), mutateAsync: mocks.del }) }));

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

describe("SpeciesSheet ownership and content", () => {
  beforeEach(() => {
    mocks.push.mockReset();
    mocks.del.mockReset().mockResolvedValue(undefined);
    mocks.confirm.mockReset();
  });
  const sheet = (sp: Species, props: Record<string, unknown> = {}) =>
    mount(SpeciesSheet, { props: { species: sp, ...props }, global: { stubs: { FocalImage: true, RichTextViewer: true } } });
  const press = async (w: ReturnType<typeof sheet>, label: string) => {
    await w.findAll("button").find((b) => b.text().includes(label))!.trigger("click");
    await flushPromises();
  };

  it("offers Edit and Delete on an owned species, and only a read-only note on a shared one", () => {
    expect(sheet(species({})).text()).toContain("Edit");
    const shared = sheet(species({}), { isShared: true });
    expect(shared.text()).toContain("Read only");
    expect(shared.text()).not.toContain("Delete");
    expect(shared.text()).not.toContain("Edit");
  });

  it("keeps the species when the delete confirmation is cancelled, and deletes then returns to the list when confirmed", async () => {
    const owned = species({});
    mocks.confirm.mockResolvedValue(false);
    await press(sheet(owned), "Delete");
    expect(mocks.del).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
    mocks.confirm.mockResolvedValue(true);
    await press(sheet(owned), "Delete");
    expect(mocks.del).toHaveBeenCalledWith(owned);
    expect(mocks.push).toHaveBeenCalledWith("/species");
  });

  it("shows ability score increases through asiToString", () => {
    const asi = (v: unknown) => sheet(species({ ability_score_increases: v as Species["ability_score_increases"] })).findAll("p").map((p) => p.text());
    expect(asi({ dex: 2, int: 1 })).toContain("+2 DEX, +1 INT");
  });

  it("draws a description only when it has words, not for an empty or blank document", () => {
    const doc = (text: string) => JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
    const has = (d: string | null) => sheet(species({ description: d })).findComponent({ name: "RichTextViewer" }).exists();
    expect(has(doc("Wings of owl"))).toBe(true);
    expect(has(doc("   "))).toBe(false);
    expect(has(null)).toBe(false);
    expect(has("plain old text")).toBe(true);
    expect(has("   ")).toBe(false);
  });
});

describe("SpeciesSheet in low art (#1179)", () => {
  const withPicture = species({ name: "Aasimar", size: "medium", image_url: "/aasimar.webp" });
  const real = { stubs: { RichTextViewer: true, AiImageBadge: true } };
  afterEach(() => {
    useLowArt().setLowArt(false);
  });

  // Bug: a low-art viewer still downloads the 7 rem species thumbnail.
  it("drops the thumbnail, keeps the name, and offers the picture behind a Portrait button", () => {
    useLowArt().setLowArt(true);
    const w = mount(SpeciesSheet, { props: { species: withPicture, isShared: true }, global: real });
    expect(w.find("img").exists()).toBe(false);
    expect(w.findComponent(FocalImage).exists()).toBe(false);
    expect(w.find("h1").text()).toBe("Aasimar");
    expect(w.text()).toContain("Portrait");
  });

  // Bug: a species with no picture of its own gets a Portrait button that opens nothing.
  it("offers no Portrait button when the species has no picture", () => {
    useLowArt().setLowArt(true);
    const w = mount(SpeciesSheet, { props: { species: species({ name: "Aasimar" }), isShared: true }, global: real });
    expect(w.text()).not.toContain("Portrait");
  });

  // Bug: with low art off the thumbnail is not marked as a record picture, so the switch cannot hide it later.
  it("with low art off, the thumbnail is a record picture and there is no Portrait button", () => {
    const w = mount(SpeciesSheet, { props: { species: withPicture, isShared: true }, global: real });
    expect(w.findComponent(FocalImage).props("record")).toBe(true);
    expect(w.text()).not.toContain("Portrait");
  });
});
