import { describe, expect, it } from "vitest";
import { activeHandOvers, handOverOf, isHandOverActive, mindedBy, speakingFor } from "./caretaking";
import type { CharacterCaretaker } from "@/types/caretaker.types";

function row(overrides: Partial<CharacterCaretaker>): CharacterCaretaker {
  return {
    id: "h1",
    campaign_id: "c1",
    party_member_id: "mira",
    caretaker_user_id: "tomas",
    granted_by: "pia",
    session_id: null,
    return_member_id: null,
    revoked_at: null,
    revoked_by: null,
    created_at: "2026-10-14T18:00:00Z",
    updated_at: "2026-10-14T18:00:00Z",
    ...overrides,
  };
}

describe("isHandOverActive", () => {
  it("holds a hand-over granted between sessions until a session takes it", () => {
    expect(isHandOverActive(row({}), null)).toBe(true);
  });

  it("holds while its own session is open", () => {
    expect(isHandOverActive(row({ session_id: "s14" }), "s14")).toBe(true);
  });

  it("lapses once its session has ended, even when another one opens", () => {
    expect(isHandOverActive(row({ session_id: "s14" }), null)).toBe(false);
    expect(isHandOverActive(row({ session_id: "s14" }), "s15")).toBe(false);
  });

  it("ends when it is taken back", () => {
    expect(isHandOverActive(row({ revoked_at: "2026-10-14T20:00:00Z" }), null)).toBe(false);
  });
});

describe("lookups", () => {
  const rows = [
    row({ id: "old", revoked_at: "2026-10-01T20:00:00Z" }),
    row({ id: "now", session_id: "s14" }),
    row({ id: "ana", party_member_id: "brand", caretaker_user_id: "ana" }),
  ];

  it("lists only the hand-overs in force", () => {
    expect(activeHandOvers(rows, "s14").map(r => r.id)).toEqual(["now", "ana"]);
  });

  it("finds who is minding a character", () => {
    expect(handOverOf(rows, "mira", "s14")?.id).toBe("now");
    expect(handOverOf(rows, "mira", null)).toBeNull();
  });

  it("finds what a user is minding", () => {
    expect(mindedBy(rows, "tomas", "s14").map(r => r.party_member_id)).toEqual(["mira"]);
    expect(mindedBy(rows, "pia", "s14")).toEqual([]);
  });
});

describe("speakingFor", () => {
  it("puts the person talking first and the character after", () => {
    expect(speakingFor("Tomas", "Mira")).toBe("Tomas, for Mira");
  });
});
