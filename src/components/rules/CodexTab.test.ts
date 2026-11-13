import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import CodexTab from "./CodexTab.vue";
import { useLowArt } from "@/composables/useLowArt";

const species = { id: "s1", name: "Aarakocra", image_url: "/bird.webp", focal_point: null, size: "Medium", description: "Bird folk", speed: { walk: 30 }, subraces: [] };
vi.mock("@/composables/rules/useSpecies", () => ({ useAllSpecies: () => ({ data: ref([species]) }) }));
vi.mock("@/composables/rules/useBackgrounds", () => ({ backgroundSourceKey: () => "k", useBackgrounds: () => ({ data: ref([]) }) }));
vi.mock("@/composables/rules/useCustomClasses", () => ({
  useAllSystemClasses: () => ({ data: ref([]) }),
  useAllCustomClasses: () => ({ data: ref([]) }),
}));
vi.mock("@/composables/rules/useCustomSubclasses", () => ({ useAllCustomSubclasses: () => ({ data: ref([]) }) }));
vi.mock("@/composables/rules/useFeatures", () => ({ useAllFeatures: () => ({ data: ref([]) }) }));
vi.mock("@/composables/deities/useDeities", () => ({ useAllDeities: () => ({ data: ref([]), isLoading: ref(false) }) }));
vi.mock("@/composables/library/useSourceTitles", () => ({ useSourceTitles: () => ({ labelFor: () => null }) }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ linkedPartyMemberId: null }) }));

const stubs = {
  AppModal: { template: "<div><slot /></div>" },
  RichTextViewer: true,
  SegmentedControl: true,
  FocalImage: { props: ["src"], template: '<img :src="src" />' },
};

async function openSpecies() {
  const w = mount(CodexTab, { global: { stubs } });
  await w.findComponent({ name: "CodexCard" }).trigger("click");
  await flushPromises();
  return w;
}

describe("CodexTab low art (#1179)", () => {
  afterEach(() => {
    useLowArt().setLowArt(false);
  });

  it("draws the species picture in the card and the sheet normally", async () => {
    expect((await openSpecies()).findAll("img")).toHaveLength(2);
  });

  it("draws no species picture in the card or the opened sheet in low art, and the text stays", async () => {
    useLowArt().setLowArt(true);
    const w = await openSpecies();
    expect(w.find("img").exists()).toBe(false);
    expect(w.text()).toContain("Aarakocra");
    expect(w.text()).toContain("Bird folk");
  });
});
