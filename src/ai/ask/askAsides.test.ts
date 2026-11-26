import { describe, expect, it, vi } from "vitest";
import { computed } from "vue";

const seen = vi.hoisted(() => ({ place: null as (() => string | null) | null, wanted: null as (() => boolean) | null, hour: null as (() => string | null) | null }));
const party = vi.hoisted(() => ({ value: undefined as { level: number }[] | undefined }));
vi.mock("@/composables/party/useActiveParty", () => ({ useActiveParty: () => ({ data: { get value() { return party.value; } } }) }));
vi.mock("@/composables/encounters/useEncounterWhere", () => ({
  useEncounterWhere: (place: () => string | null, wanted: () => boolean, hour: () => string | null) => {
    seen.hour = hour;
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

describe("the encounter's Where aside at an hour", () => {
  // Bug caught: the aside read the card's place but not its Time of day, so "resting by day" never showed.
  it("reads the card's Time of day, and Any time as no hour", () => {
    let inputs: Record<string, unknown> = { time_of_day: "dusk" };
    ASK_ASIDES.encounter_where(() => inputs);
    expect(seen.hour?.()).toBe("dusk");
    inputs = { time_of_day: "any" };
    expect(seen.hour?.()).toBeNull();
  });
});

describe("the quest hooks' party level aside", () => {
  // Bug caught: the card dropping the panel's read-only party level, so a DM could not see which level the hooks would be written for.
  it("says the level the hooks are written for, rounded up from the party's average", () => {
    party.value = [{ level: 3 }, { level: 4 }];
    expect(ASK_ASIDES.party_level(() => ({})).value).toBe("Written for party level 4 (average of 2 members).");
    party.value = [{ level: 5 }];
    expect(ASK_ASIDES.party_level(() => ({})).value).toBe("Written for party level 5 (average of 1 member).");
  });

  // Bug caught: an empty party read as level 1 with no word, when the prompt silently falls back to it.
  it("says so when there is no party, and says nothing while the party loads", () => {
    party.value = [];
    expect(ASK_ASIDES.party_level(() => ({})).value).toMatch(/No party yet/);
    party.value = undefined;
    expect(ASK_ASIDES.party_level(() => ({})).value).toBeNull();
  });
});
