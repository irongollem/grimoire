import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import ItemSheet from "./ItemSheet.vue";
import type { Item } from "@/types/item.types";
import { useLowArt } from "@/composables/useLowArt";

vi.mock("@/composables/library/useSourceTitles", () => ({
  useSourceTitles: () => ({ labelFor: (source: string | null | undefined) => source ?? null }),
}));
vi.mock("@/composables/dungeon-features/useLootTables", () => ({ useLootTablesByItem: () => ref([]) }));
vi.mock("@/composables/campaign/useCampaigns", () => ({ useDmCampaigns: () => ({ data: ref([]) }) }));
vi.mock("pinia", async (importOriginal) => ({
  ...(await importOriginal<typeof import("pinia")>()),
  storeToRefs: () => ({ activeCampaignId: ref("campaign-1") }),
}));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({}) }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ linkedPartyMemberId: null }) }));

const IDENTIFIED = "https://cdn.test/flame-tongue.webp";
const MUNDANE = "https://cdn.test/old-sword.webp";

function item(overrides: Partial<Item> = {}): Item {
  return {
    id: "item-1",
    name: "Flame Tongue",
    item_type: "weapon",
    rarity: "very_rare",
    tags: [],
    description: "",
    image_url: IDENTIFIED,
    image_focal_point: null,
    mundane_image_url: MUNDANE,
    mundane_image_focal_point: null,
    ...overrides,
  } as unknown as Item;
}

// The real FocalImage, so a picture that is still drawn shows up as an img.
const stubs = {
  AiImageBadge: true,
  RouterLink: true,
  ItemDocumentSection: true,
  ConnectionsSection: true,
  RichTextViewer: true,
  WeaponMasteryBadge: true,
  CanonHere: { props: ["kind", "id"], template: "<div data-testid='canon-here' :data-kind='kind' :data-id='id' />" },
};
const open = (overrides: Partial<Item> = {}) => mount(ItemSheet, { props: { item: item(overrides) }, global: { stubs } });

describe("ItemSheet in low art (#1179)", () => {
  const { setLowArt } = useLowArt();
  afterEach(() => {
    setLowArt(false);
  });

  it("the item sheet still draws its picture column in low art: no img and no 18.75rem track", () => {
    setLowArt(true);
    const w = open();
    expect(w.find("img").exists()).toBe(false);
    expect(w.html()).not.toContain("18.75rem");
    // The left column's Type/Rarity box is gone: those values live on the fact line.
    expect(w.text().replace("Rarity VR", "")).not.toContain("Rarity");
    expect(w.text()).toContain("Very Rare");
  });

  it("turns the Identified/Mundane tabs into two Portrait buttons and hangs a VR rarity tab", () => {
    setLowArt(true);
    const w = open();
    const labels = w.findAll("button").map((b) => b.text());
    expect(labels).toContain("Identified");
    expect(labels).toContain("Mundane");
    expect(w.findAll(".sr-only").some((e) => e.text() === "Rarity VR")).toBe(true);
  });

  it("hides the Mundane button when the item has no mundane picture", () => {
    setLowArt(true);
    const labels = open({ mundane_image_url: null }).findAll("button").map((b) => b.text());
    expect(labels).toContain("Identified");
    expect(labels).not.toContain("Mundane");
  });

  it("with low art off the sheet paints its picture and has no rarity tab", () => {
    const w = open();
    expect(w.find("img").exists()).toBe(true);
    expect(w.findAll(".sr-only").some((e) => e.text() === "Rarity VR")).toBe(false);
  });
});

describe("ItemSheet clues (#1258 item 30)", () => {
  const UUID = "0b1f3c52-6a0e-4f5b-9a55-1c2d3e4f5a6b";
  const shown = (props: { item: Item; playerView?: boolean }) => mount(ItemSheet, { props, global: { stubs } });

  // Bug: a clue lying in an item never showed on the item, or showed to a player reading it.
  it("asks the canon about the item by its id for the DM, and never on a player's view", () => {
    expect(shown({ item: item({ id: UUID }) }).get("[data-testid=canon-here]").attributes()).toMatchObject({ "data-kind": "item", "data-id": UUID });
    expect(shown({ item: item({ id: UUID }), playerView: true }).find("[data-testid=canon-here]").exists()).toBe(false);
  });

  // Bug: a shared-library item (a text id, no row to put a clue in) asked the database a uuid question with a text id.
  it("does not ask for a library item, which has no row", () => {
    expect(shown({ item: item({ id: "srd_longsword" }) }).find("[data-testid=canon-here]").exists()).toBe(false);
  });
});
