import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import BackgroundSheet from "./BackgroundSheet.vue";
import FocalImage from "@/components/common/media/FocalImage.vue";
import { useLowArt } from "@/composables/useLowArt";
import type { Background } from "@/types/background.types";

vi.mock("vue-router", () => ({ useRoute: () => ({ query: {} }), useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: vi.fn() }) }));
vi.mock("@/composables/library/useSourceTitles", () => ({ useSourceTitles: () => ({ labelFor: () => null }) }));
vi.mock("@/composables/rules/useBackgrounds", async (orig) => ({
  ...(await orig<typeof import("@/composables/rules/useBackgrounds")>()),
  useDeleteBackground: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/composables/party/useParty", () => ({ useParty: () => ({ data: ref([]) }) }));
vi.mock("@/composables/items/usePartyInventory", () => ({ useAddInventoryItem: () => ({ mutateAsync: vi.fn() }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "c1" }) }));

function background(overrides: Partial<Background> = {}): Background {
  return {
    id: "srd_acolyte", user_id: "u1", name: "Acolyte", description: null,
    skill_proficiencies: [], tool_proficiencies: [], languages: [], equipment: null,
    feature_name: null, feature_description: null, tags: [], source: null,
    image_url: "/acolyte.webp", focal_point: null,
    ...overrides,
  } as unknown as Background;
}

const global = { stubs: { RichTextViewer: true, AiImageBadge: true, EntityCombobox: true } };

afterEach(() => {
  useLowArt().setLowArt(false);
});

describe("BackgroundSheet in low art (#1179)", () => {
  // Bug: a low-art viewer still downloads the 7 rem background thumbnail.
  it("drops the thumbnail, keeps the name and offers the picture behind a Portrait button", () => {
    useLowArt().setLowArt(true);
    const w = mount(BackgroundSheet, { props: { background: background() }, global });
    expect(w.find("img").exists()).toBe(false);
    expect(w.findComponent(FocalImage).exists()).toBe(false);
    expect(w.find("h1").text()).toBe("Acolyte");
    expect(w.text()).toContain("Portrait");
  });

  // Bug: a Portrait button that opens nothing for a background without a picture.
  it("offers no Portrait button when the background has no picture of its own", () => {
    useLowArt().setLowArt(true);
    const w = mount(BackgroundSheet, { props: { background: background({ image_url: null }) }, global });
    expect(w.text()).not.toContain("Portrait");
  });

  // Bug: with low art off the thumbnail is not a record picture, so the switch cannot hide it.
  it("with low art off, the thumbnail is a record picture", () => {
    const w = mount(BackgroundSheet, { props: { background: background() }, global });
    expect(w.findComponent(FocalImage).props("record")).toBe(true);
    expect(w.text()).not.toContain("Portrait");
  });
});
