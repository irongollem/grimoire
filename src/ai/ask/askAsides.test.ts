import { describe, expect, it, vi } from "vitest";
import { computed } from "vue";

const seen = vi.hoisted(() => ({ place: null as (() => string | null) | null, wanted: null as (() => boolean) | null }));
vi.mock("@/composables/encounters/useEncounterWhere", () => ({
  useEncounterWhere: (place: () => string | null, wanted: () => boolean) => {
    seen.place = place;
    seen.wanted = wanted;
    return { line: computed(() => "Uses Coast road here") };
  },
}));

const { ASK_ASIDES } = await import("./askAsides");

describe("the encounter's Where aside", () => {
  // Bug caught: the aside reading habitats and tables on every card, before any place is named (egress for a closed form).
  it("reads nothing until a place is named, and reads the place the inputs name", () => {
    let inputs: Record<string, unknown> = {};
    const line = ASK_ASIDES.encounter_where(() => inputs);
    expect(line.value).toBe("Uses Coast road here");
    expect(seen.wanted?.()).toBe(false);
    expect(seen.place?.()).toBeNull();
    inputs = { location_id: "place-1" };
    expect(seen.wanted?.()).toBe(true);
    expect(seen.place?.()).toBe("place-1");
  });
});
