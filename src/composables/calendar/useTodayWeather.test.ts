import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const state = vi.hoisted(() => ({
  active: null as null | { id: string; current_location_id: string | null; climate: string; weather_pins: [] },
  gates: [] as Array<() => boolean>,
}));

vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ get activeCampaign() { return state.active; } }) }));
vi.mock("@/stores/calendar", () => ({ useCalendarStore: () => ({}) }));
vi.mock("@/composables/locations/useLocations", () => ({
  useAllLocations: (enabled: () => boolean) => { state.gates.push(enabled); return { data: ref([]) }; },
  useSharedLocations: (enabled: () => boolean) => { state.gates.push(enabled); return { data: ref([]) }; },
}));

import { useWeatherSource } from "./useTodayWeather";

describe("useWeatherSource", () => {
  // Bug: the places were read (a third serial wave on the player's Hearth) even when the party has no current place to resolve.
  it.each([
    ["the DM's list", {}],
    ["the player's shared list", { player: true }],
  ])("reads %s only when the party has a current place", (_name, options) => {
    state.gates = [];
    state.active = { id: "c1", current_location_id: null, climate: "temperate", weather_pins: [] };
    useWeatherSource(options);
    expect(state.gates[0]?.()).toBe(false);
    state.active = { ...state.active, current_location_id: "p1" };
    expect(state.gates[0]?.()).toBe(true);
  });
});
