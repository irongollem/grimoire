import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";
import ClassList from "./ClassList.vue";
import { useLowArt } from "@/composables/useLowArt";
import { useListLayout } from "@/composables/useListLayout";
import { useVirtualGridViewport } from "@/components/common/list/virtualGridTestViewport";
import type { CustomClass, SystemClass } from "@/levelup/customTypes";

const custom = ref<CustomClass[]>([]);
const system = ref<SystemClass[]>([]);
vi.mock("vue-router", async (orig) => ({ ...(await orig<typeof import("vue-router")>()), useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: vi.fn(), fromError: String }) }));
vi.mock("@/composables/rules/useCustomClasses", () => ({
  useAllCustomClasses: () => ({ data: custom, isLoading: ref(false) }),
  useAllSystemClasses: () => ({ data: system, isLoading: ref(false) }),
  useDuplicateClass: () => ({ duplicate: vi.fn() }),
}));

useVirtualGridViewport();

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
const mountList = () => mount(ClassList, { global: { stubs: { RouterLink: true, AiImageBadge: true } } });

beforeEach(() => {
  setActivePinia(createPinia());
  useListLayout("codex-classes", "grid").value = "grid";
  const base = { hit_die: 12, saving_throws: ["STR"], features: {}, focal_point: null, image_url: "/c.webp", campaign_id: null };
  custom.value = [{ ...base, id: "c1", class_name: "Gunslinger", source: "Homebrew Book" } as unknown as CustomClass];
  system.value = [{ ...base, id: "s1", class_name: "Barbarian", spell_slots: null } as unknown as SystemClass];
  useLowArt().setLowArt(true);
});

afterEach(() => {
  useLowArt().setLowArt(false);
  useListLayout("codex-classes", "grid").value = "grid";
});

describe("ClassList in low art (#1179)", () => {
  // Bug: the class list still downloads pictures in low art.
  it("grid cards draw no picture, show each name once and keep the book in the foot", async () => {
    const w = mountList();
    await flush();
    expect(w.find("img").exists()).toBe(false);
    expect(w.findAll("h3").map((h) => h.text()).filter((t) => t === "Gunslinger" || t === "Barbarian")).toEqual(["Gunslinger", "Barbarian"]);
    expect(w.text()).toContain("Homebrew Book");
    // The book is the foot's, not repeated in the meta line.
    expect(w.text().match(/Homebrew Book/g)).toHaveLength(1);
  });

  // Bug: the duplicate button keeps the white overlay-chip colours on a plain card and vanishes.
  it("the duplicate control stays on an art-free card without the overlay chip style", async () => {
    const w = mountList();
    await flush();
    const dup = w.find("[aria-label='Duplicate class']");
    expect(dup.exists()).toBe(true);
    expect(dup.classes()).not.toContain("text-white");
  });

  // Bug: the list opts out of the ledger.
  it("rows are a ledger with a Source column", async () => {
    useListLayout("codex-classes", "grid").value = "rows";
    const w = mountList();
    await flush();
    expect(w.findAll("[data-ledger-head]").length).toBeGreaterThan(0);
    expect(w.find("img").exists()).toBe(false);
  });
});
