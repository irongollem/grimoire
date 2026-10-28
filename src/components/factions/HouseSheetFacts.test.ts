import { describe, expect, it, vi } from "vitest";
import { computed } from "vue";
import { mount, RouterLinkStub } from "@vue/test-utils";
import HouseSheetFacts from "./HouseSheetFacts.vue";
import { makeSource } from "@/components/kinship/testGraph";
import type { Faction } from "@/types/faction.types";

vi.mock("@/composables/kinship/useKinGraph", () => ({ useDmKinGraph: () => makeSource() }));
const rows = vi.hoisted(() => ({ npcs: [] as { npc_id: string; status: string; succession_rank: number | null }[] }));
vi.mock("@/composables/factions/useFactions", () => ({
  useFactionNpcs: () => ({ data: computed(() => rows.npcs) }),
  useFactionPartyMembers: () => ({ data: computed(() => []) }),
}));
vi.mock("@/composables/locations/useLocations", () => ({
  useLocationNames: () => computed(() => new Map([["loc-1", "Thornkeep"]])),
}));

const house = (seat: string | null, extra: Partial<Faction> = {}) =>
  ({ id: "h1", name: "House Thane", faction_type: "House", descent: "either", succession_note: "", seat_location_id: seat, ...extra }) as Faction;

const mountIt = (seat: string | null, extra: Partial<Faction> = {}) =>
  mount(HouseSheetFacts, { props: { faction: house(seat, extra) }, global: { stubs: { RouterLink: RouterLinkStub } } });

describe("HouseSheetFacts", () => {
  it("shows the seat as a link to its place", () => {
    const w = mountIt("loc-1");
    expect(w.text()).toContain("Seat");
    expect(w.findComponent(RouterLinkStub).props("to")).toBe("/locations?at=loc-1");
    expect(w.text()).toContain("Thornkeep");
  });

  it("shows no seat row without a seat, or when the place cannot be named", () => {
    expect(mountIt(null).text()).not.toContain("Seat");
    expect(mountIt("loc-gone").text()).not.toContain("Seat");
  });

  const npc = (id: string, rank: number | null) => ({ npc_id: id, status: "Active", succession_rank: rank });

  it("the heir is the first of the line who is alive, linked to their sheet", () => {
    // Aldous is dead in the test family: he keeps rank 1 but does not inherit.
    rows.npcs = [npc("aldous", 1), npc("bren", 2), npc("tomas", 3)];
    const w = mountIt(null);
    expect(w.text()).toContain("Heir");
    const link = w.findAllComponents(RouterLinkStub).find((l) => l.text() === "Bren");
    expect(link?.props("to")).toBe("/npcs/bren");
    expect(w.text()).not.toContain("Tomas");
    rows.npcs = [];
  });

  it("shows no heir row when nobody is ranked", () => {
    rows.npcs = [npc("bren", null)];
    expect(mountIt(null).text()).not.toContain("Heir");
    rows.npcs = [];
  });

  it("words the descent and shows the succession note only when it says something", () => {
    expect(mountIt(null, { descent: "mother" }).text()).toContain("Through the mother");
    expect(mountIt(null, { descent: null }).text()).toContain("Through either parent");
    expect(mountIt(null, { succession_note: "   " }).find("blockquote").exists()).toBe(false);
    expect(mountIt(null, { succession_note: "Eldest daughter first" }).find("blockquote").text()).toBe("Eldest daughter first");
  });
});
