import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";
import BackgroundList from "./BackgroundList.vue";
import { useLowArt } from "@/composables/useLowArt";
import { useListLayout } from "@/composables/useListLayout";
import { useVirtualGridViewport } from "@/components/common/list/virtualGridTestViewport";
import type { Background } from "@/types/background.types";

const backgrounds = ref<Background[]>([]);
vi.mock("@/composables/rules/useBackgrounds", async (orig) => ({
  ...(await orig<typeof import("@/composables/rules/useBackgrounds")>()),
  useBackgrounds: () => ({ data: backgrounds, isLoading: ref(false) }),
}));
vi.mock("@/composables/library/useSourceTitles", () => ({
  useSourceTitles: () => ({ labelFor: (s: string | null | undefined, t?: string | null) => t ?? s ?? null }),
}));
vi.mock("@/composables/useScrollRestore", () => ({ useScrollRestore: () => ({}) }));

useVirtualGridViewport();

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

function mountList(props: Record<string, unknown> = {}) {
  return mount(BackgroundList, { props, global: { stubs: { RouterLink: true, AiImageBadge: true } } });
}

beforeEach(() => {
  setActivePinia(createPinia());
  useListLayout("codex-backgrounds", "grid").value = "grid";
  backgrounds.value = [
    {
      id: "11111111-1111-4111-8111-000000000001", user_id: "u1", name: "Acolyte", description: null,
      skill_proficiencies: ["Insight"], tool_proficiencies: [], languages: [], equipment: null,
      feature_name: "Shelter of the Faithful", feature_description: null, tags: [], source: "Homebrew Book",
      image_url: "/acolyte.webp", focal_point: null,
    } as unknown as Background,
  ];
  useLowArt().setLowArt(true);
});

afterEach(() => {
  useLowArt().setLowArt(false);
  useListLayout("codex-backgrounds", "grid").value = "grid";
});

describe("BackgroundList in low art (#1179)", () => {
  // Bug: the background list still downloads pictures in low art.
  it("grid cards draw no picture and name the kind in the eyebrow", async () => {
    const w = mountList();
    await flush();
    expect(w.find("img").exists()).toBe(false);
    expect(w.findAll("h3").map((h) => h.text())).toEqual(["Acolyte"]);
    expect(w.text()).toContain("Background");
    expect(w.text()).toContain("Shelter of the Faithful");
  });

  // Bug: the list opts out of the ledger, so rows keep their emblem and have no column heads.
  it("rows are a ledger with a Source column and no emblem", async () => {
    useListLayout("codex-backgrounds", "grid").value = "rows";
    const w = mountList();
    await flush();
    expect(w.find("[data-ledger-head]").text()).toContain("Source");
    expect(w.find("img").exists()).toBe(false);
    expect(w.text()).toContain("Acolyte");
  });

  // Bug: the player's Select button disappears from an art-free card.
  it("the picker's Select button and chosen ring survive without art", async () => {
    const w = mountList({ selectMode: true, selectedId: "11111111-1111-4111-8111-000000000001" });
    await flush();
    expect(w.findAll("button").some((b) => b.text() === "Select")).toBe(true);
    expect(w.find(".ring-primary\\/20").exists()).toBe(true);
  });
});
