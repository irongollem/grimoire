import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import CustomSubclassSheet from "./CustomSubclassSheet.vue";
import FocalImage from "@/components/common/media/FocalImage.vue";
import { useLowArt } from "@/composables/useLowArt";
import type { CustomSubclass } from "@/levelup/customTypes";

vi.mock("vue-router", () => ({ useRoute: () => ({ query: {} }), useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: vi.fn() }) }));
vi.mock("@/composables/library/useSourceTitles", () => ({ useSourceTitles: () => ({ labelFor: () => null }) }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ user: { id: "u1" }, isAppAdmin: false }) }));
vi.mock("@/composables/rules/useFeatures", () => ({ useAllFeatures: () => ({ data: ref([]) }) }));
vi.mock("@/composables/spells/useSpellsByIds", () => ({ useSpellsByIds: () => ({ data: ref(new Map()) }) }));
vi.mock("@/composables/rules/useCustomSubclasses", async (orig) => ({
  ...(await orig<typeof import("@/composables/rules/useCustomSubclasses")>()),
  useDeleteCustomSubclass: () => ({ mutateAsync: vi.fn() }),
}));

function sub(overrides: Partial<CustomSubclass> = {}): CustomSubclass {
  return {
    id: "s1", user_id: "u1", campaign_id: null, class_name: "Barbarian", subclass_name: "Path of Hellfire",
    source: null, description: null, features: {}, granted_spells: {}, spell_variants: {},
    expanded_spell_variants: {}, expanded_spells: {}, spellcasting: null,
    image_url: "/hell.webp", focal_point: null,
    ...overrides,
  } as unknown as CustomSubclass;
}

const global = { stubs: { RichTextViewer: true, AiImageBadge: true } };

afterEach(() => {
  useLowArt().setLowArt(false);
});

describe("CustomSubclassSheet in low art (#1179)", () => {
  // Bug: a low-art viewer still downloads the archetype thumbnail.
  it("drops the thumbnail, keeps the class chip and offers the picture behind a Portrait button", () => {
    useLowArt().setLowArt(true);
    const w = mount(CustomSubclassSheet, { props: { sub: sub() }, global });
    expect(w.find("img").exists()).toBe(false);
    expect(w.findComponent(FocalImage).exists()).toBe(false);
    expect(w.text()).toContain("Barbarian");
    expect(w.text()).toContain("Portrait");
  });

  // Bug: a Portrait button that opens nothing for an archetype without a picture.
  it("offers no Portrait button when the archetype has no picture", () => {
    useLowArt().setLowArt(true);
    expect(mount(CustomSubclassSheet, { props: { sub: sub({ image_url: null }) }, global }).text()).not.toContain("Portrait");
  });

  // Bug: with low art off the thumbnail is not a record picture.
  it("with low art off, the thumbnail is a record picture", () => {
    expect(mount(CustomSubclassSheet, { props: { sub: sub() }, global }).findComponent(FocalImage).props("record")).toBe(true);
  });
});
