import { mount, RouterLinkStub } from "@vue/test-utils";
import { ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import PantheonSheet from "./PantheonSheet.vue";
import { useLowArt } from "@/composables/useLowArt";
import type { Pantheon } from "@/types/deity.types";

vi.mock("@/composables/deities/useDeities", () => ({
  useAllDeities: () => ({ data: ref([{ id: "d1", name: "Tyr", pantheon_id: "p1" }]) }),
}));

const pantheon = (overrides: Partial<Pantheon> = {}) =>
  ({ id: "p1", name: "Faerunian", description: null, emblem_url: "https://cdn.test/e.webp", tags: ["gods"], ...overrides }) as Pantheon;
const mountSheet = (p = pantheon()) => mount(PantheonSheet, { props: { pantheon: p }, global: { stubs: { RouterLink: RouterLinkStub, AiImageBadge: true } } });

describe("PantheonSheet in low art (#1179)", () => {
  afterEach(() => {
    useLowArt().setLowArt(false);
  });

  it("draws the emblem with low art off", () => {
    expect(mountSheet().find("img").exists()).toBe(true);
  });

  // Bug: the emblem is still fetched in low art, or the button is missing.
  it("draws no emblem, lists the deities in the fact line and offers an Emblem button", () => {
    useLowArt().setLowArt(true);
    const wrapper = mountSheet();
    expect(wrapper.find("img").exists()).toBe(false);
    expect(wrapper.text()).toContain("Tyr");
    expect(wrapper.text()).toContain("Emblem");
  });

  it("offers no Emblem button when the pantheon has no emblem", () => {
    useLowArt().setLowArt(true);
    expect(mountSheet(pantheon({ emblem_url: null })).text()).not.toContain("Emblem");
  });
});
