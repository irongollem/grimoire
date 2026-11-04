import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const speciesAsked = vi.hoisted(() => [] as (readonly (string | null | undefined)[])[]);
const members = vi.hoisted(() => ({ value: [] as Record<string, unknown>[] }));

vi.mock("@/composables/party/useParty", () => ({ useParty: () => ({ data: ref(members.value) }) }));
vi.mock("@/composables/rules/useSpecies", () => ({
  useSpeciesByIds: (ids: () => readonly (string | null | undefined)[]) => {
    speciesAsked.push(ids());
    return { data: ref(new Map()) };
  },
}));

import { usePartySenses } from "./usePartySenses";

describe("usePartySenses", () => {
  it("gives a member the senses their own senses field lists", () => {
    members.value = [{ id: "m1", species_id: "s1", subrace: null, senses: "Darkvision 60 ft." }];
    const senses = usePartySenses();
    expect(senses.value("m1")?.darkvision).toBe(60);
  });

  it("gives null for an unknown member, a missing id and an unreadable member", () => {
    members.value = [{ id: "m1", species_id: null, subrace: null, senses: "" }];
    const senses = usePartySenses();
    expect(senses.value("other")).toBeNull();
    expect(senses.value(null)).toBeNull();
    expect(senses.value(undefined)).toBeNull();
  });

  it("does not leak one member's senses to another", () => {
    members.value = [
      { id: "m1", species_id: null, subrace: null, senses: "Darkvision 60 ft." },
      { id: "m2", species_id: null, subrace: null, senses: "" },
    ];
    expect(usePartySenses().value("m2")?.darkvision).toBe(0);
  });

  it("asks for every member's species in one lookup", () => {
    members.value = [
      { id: "m1", species_id: "a", subrace: null, senses: "" },
      { id: "m2", species_id: "b", subrace: null, senses: "" },
    ];
    speciesAsked.length = 0;
    usePartySenses();
    expect(speciesAsked).toEqual([["a", "b"]]);
  });
});
