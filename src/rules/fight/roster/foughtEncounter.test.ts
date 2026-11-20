import { describe, expect, it } from "vitest";
import { foughtEncounter } from "./foughtEncounter";

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

  // #1021 allies: the party members the AI plays fight beside the played character; anyone else stays out.
  it("keeps the AI-played allies the encounter lists, after the played character, and no one else", () => {
    expect(foughtEncounter(encounter, "b", (id) => id === "c").party_member_ids).toEqual(["b", "c"]);
  });

  it("does not field the played character twice when the AI could also play them", () => {
    expect(foughtEncounter(encounter, "b", () => true).party_member_ids).toEqual(["b", "a", "c"]);
  });

  it("does not mutate the saved encounter it narrows", () => {
    foughtEncounter(encounter, "b");
    expect(encounter.party_member_ids).toEqual(["a", "b", "c"]);
  });
});
