import { describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";
import { mount, RouterLinkStub } from "@vue/test-utils";
import HouseSheetFacts from "./HouseSheetFacts.vue";
import { makeSource } from "@/components/kinship/testGraph";
import type { Faction } from "@/types/faction.types";

vi.mock("@/composables/kinship/useKinGraph", () => ({ useDmKinGraph: () => makeSource() }));
vi.mock("@/composables/factions/useFactions", () => ({
  useFactionNpcs: () => ({ data: ref([]) }),
  useFactionPartyMembers: () => ({ data: ref([]) }),
}));
vi.mock("@/composables/locations/useLocations", () => ({
  useLocationNames: () => computed(() => new Map([["loc-1", "Thornkeep"]])),
}));

const house = (seat: string | null) =>
  ({ id: "h1", name: "House Thane", faction_type: "House", descent: "either", succession_note: "", seat_location_id: seat }) as Faction;

const mountIt = (seat: string | null) =>
  mount(HouseSheetFacts, { props: { faction: house(seat) }, global: { stubs: { RouterLink: RouterLinkStub } } });

describe("HouseSheetFacts", () => {
  it("shows the seat as a link to its place", () => {
    const w = mountIt("loc-1");
    expect(w.text()).toContain("Seat");
    expect(w.findComponent(RouterLinkStub).props("to")).toBe("/locations?at=loc-1");
    expect(w.text()).toContain("Thornkeep");
  });

  it("shows no seat row without a seat", () => {
    expect(mountIt(null).text()).not.toContain("Seat");
  });
});
