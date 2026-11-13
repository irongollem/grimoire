import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import FactionSheet from "./FactionSheet.vue";
import { useLowArt } from "@/composables/useLowArt";
import type { Faction } from "@/types/faction.types";

vi.mock("vue-router", async (orig) => ({
  ...(await orig<typeof import("vue-router")>()),
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: vi.fn() }) }));
vi.mock("@/composables/factions/useFactions", () => ({ useDeleteFaction: () => ({ mutateAsync: vi.fn() }) }));

const faction = (o: Partial<Faction> = {}) =>
  ({ id: "f1", name: "The Iron Circle", faction_type: "Guild", description: null, emblem_url: "https://cdn.test/e.webp", alignment: null, party_standing: "friendly", tags: ["trade"], ...o }) as Faction;
const mountSheet = (f = faction()) => mount(FactionSheet, { props: { faction: f }, global: { stubs: { RouterLink: true, AiImageBadge: true } } });

describe("FactionSheet in low art (#1179)", () => {
  afterEach(() => {
    useLowArt().setLowArt(false);
  });

  it("draws the emblem with low art off", () => {
    expect(mountSheet().find("img").exists()).toBe(true);
  });

  // Bug: the emblem column survives in low art.
  it("draws no emblem, keeps type and standing in the fact line and offers an Emblem button", () => {
    useLowArt().setLowArt(true);
    const wrapper = mountSheet();
    expect(wrapper.find("img").exists()).toBe(false);
    expect(wrapper.text()).toContain("Guild");
    expect(wrapper.text().toLowerCase()).toContain("friendly");
    expect(wrapper.text()).toContain("Emblem");
  });
});
