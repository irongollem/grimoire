import { describe, expect, it } from "vitest";
import { buildPartyEntries, formatMetDate } from "@/components/player/people/peopleParty";
import type { Companion } from "@/types/companion.types";
import type { PartyMember } from "@/types/party.types";

const member = (id: string, name: string) => ({ id, name }) as PartyMember;
const companion = (id: string, name: string, owner: string | null) =>
  ({ id, name, owner_party_member_id: owner }) as Companion;

describe("buildPartyEntries", () => {
  it("puts the viewer first, then members with their own companions, then shared ones", () => {
    const entries = buildPartyEntries(
      [member("a", "Ash"), member("b", "Brin"), member("c", "Cael")],
      [companion("x", "Wolf", "c"), companion("y", "Mule", null), companion("z", "Hawk", "c")],
      "b",
    );
    expect(entries.map((e) => e.data.name)).toEqual(["Brin", "Ash", "Cael", "Hawk", "Wolf", "Mule"]);
  });
});

describe("formatMetDate", () => {
  const now = new Date("2026-10-06T12:00:00Z");
  it("omits the year within this year", () => {
    expect(formatMetDate("2026-10-04T12:00:00Z", now)).toBe("4 October");
  });
  it("adds the year otherwise", () => {
    expect(formatMetDate("2025-03-09T12:00:00Z", now)).toBe("9 March 2025");
  });
});
