import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";
import ArchetypeList from "./ArchetypeList.vue";
import { useLowArt } from "@/composables/useLowArt";
import { useListLayout } from "@/composables/useListLayout";
import { useVirtualGridViewport } from "@/components/common/list/virtualGridTestViewport";
import type { CustomSubclass } from "@/levelup/customTypes";

const subclasses = ref<CustomSubclass[]>([]);
vi.mock("@/composables/library/useSourceTitles", () => ({ useSourceTitles: () => ({ labelFor: (s: string | null) => s }) }));
vi.mock("@/composables/rules/useCustomSubclasses", () => ({
  useAllCustomSubclasses: () => ({ data: subclasses, isLoading: ref(false) }),
  useCreateCustomSubclass: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/composables/rules/useCustomClasses", () => ({
  useAllSystemClasses: () => ({ data: ref([{ class_name: "Barbarian", image_url: "/barbarian-class.webp" }]) }),
  useAllCustomClasses: () => ({ data: ref([]) }),
}));
vi.mock("@/composables/rules/useFeatures", () => ({ useCreateFeature: () => ({ mutateAsync: vi.fn() }) }));

useVirtualGridViewport();

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
const mountList = () => mount(ArchetypeList, { global: { stubs: { RouterLink: true, AiImageBadge: true } } });

beforeEach(() => {
  setActivePinia(createPinia());
  useListLayout("codex-archetypes", "grid").value = "grid";
  subclasses.value = [
    {
      id: "a1", class_name: "Barbarian", subclass_name: "Path of Hellfire", source: "Homebrew Book",
      source_document_key: null, description: null, features: { "3": ["f1"] }, campaign_id: null,
      image_url: null, focal_point: null,
    } as unknown as CustomSubclass,
  ];
});

afterEach(() => {
  useLowArt().setLowArt(false);
  useListLayout("codex-archetypes", "grid").value = "grid";
});

describe("ArchetypeList", () => {
  // Bug: the archetype card still borrows its class's picture (frame 02: "stop borrowing").
  it("never draws the base class's picture, in either mode, and names the class in the eyebrow", async () => {
    for (const low of [false, true]) {
      useLowArt().setLowArt(low);
      const w = mountList();
      await flush();
      expect(w.find("img").exists()).toBe(false);
      expect(w.html()).not.toContain("barbarian-class.webp");
      expect(w.find("[data-art-free]").exists()).toBe(true);
      expect(w.findAll("h3").map((h) => h.text())).toContain("Path of Hellfire");
      expect(w.text()).toContain("Homebrew Book");
    }
  });

  // Bug: the ledger rows keep the borrowed class emblem.
  it("low art rows are a ledger without the borrowed class emblem", async () => {
    useLowArt().setLowArt(true);
    useListLayout("codex-archetypes", "grid").value = "rows";
    const w = mountList();
    await flush();
    expect(w.find("[data-ledger-head]").exists()).toBe(true);
    expect(w.html()).not.toContain("barbarian-class.webp");
  });

  // Bug: normal-mode rows still show the borrowed class picture as the emblem.
  it("rows with low art off do not borrow the class picture either", async () => {
    useListLayout("codex-archetypes", "grid").value = "rows";
    const w = mountList();
    await flush();
    expect(w.html()).not.toContain("barbarian-class.webp");
  });
});
