import { describe, expect, it } from "vitest";
import { foughtEncounter } from "@/composables/encounters/useOpenRun";

const encounter = { name: "Ambush", party_member_ids: ["a", "b", "c"] };

describe("foughtEncounter", () => {
  it("leaves the DM's own fight with its whole party when there is no solo member", () => {
    expect(foughtEncounter(encounter, null)).toBe(encounter);
  });

  it("fields only the solo character, not the encounter's whole party", () => {
    const fought = foughtEncounter(encounter, "b");
    expect(fought.party_member_ids).toEqual(["b"]);
    expect(fought.name).toBe("Ambush");
  });

  it("fields a solo character the encounter did not list, rather than nobody", () => {
    expect(foughtEncounter(encounter, "z").party_member_ids).toEqual(["z"]);
  });

  it("does not mutate the saved encounter it narrows", () => {
    foughtEncounter(encounter, "b");
    expect(encounter.party_member_ids).toEqual(["a", "b", "c"]);
  });
});
