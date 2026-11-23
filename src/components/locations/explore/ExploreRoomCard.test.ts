import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import ExploreRoomCard from "./ExploreRoomCard.vue";
import type { Location } from "@/types/location.types";

vi.mock("@/composables/encounters/useEncounters", () => ({ useEncountersByLocation: () => ({ data: ref([]) }) }));

const stub = (name: string) => ({ name, props: { kind: String, id: String, compact: Boolean }, template: `<div data-testid="${name}" />` });
const stubs = {
  CanonHere: stub("CanonHere"), SiteRunRoomStack: stub("SiteRunRoomStack"), LocationStateControls: stub("LocationStateControls"),
  SiteRunBeatCard: stub("SiteRunBeatCard"), SiteRunWaysOut: stub("SiteRunWaysOut"), AppButton: true,
};
const mountCard = (room: Location | null) =>
  mount(ExploreRoomCard, { props: { siteId: "s1", room, entering: false, regions: [], doors: [], doorState: () => undefined, loot: [], campaignId: "c1", beat: null }, global: { stubs } });

describe("ExploreRoomCard", () => {
  // Bug caught: the Play screen mounting no Canon here, or for the site instead of the room the party stands in.
  it("mounts a compact Canon here for the room, not the site", () => {
    const here = mountCard({ id: "room-1", name: "The Chapel" } as Location).findComponent({ name: "CanonHere" });
    expect(here.props()).toMatchObject({ kind: "location", id: "room-1", compact: true });
  });

  // Bug caught: Canon here mounted with no room, asking for clues at an empty id.
  it("mounts none while the party is in no room", () => {
    expect(mountCard(null).findComponent({ name: "CanonHere" }).exists()).toBe(false);
  });
});
