import { describe, expect, it } from "vitest";
import { nextSessionNumber, openedSession, prologueFrom, sessionRow, wholeCredits } from "./sessionRows.ts";

describe("wholeCredits", () => {
  it("a missing or non-numeric answer throws rather than billing nothing", () => {
    expect(() => wholeCredits(null)).toThrow();
    expect(() => wholeCredits(undefined)).toThrow();
    expect(() => wholeCredits("lots")).toThrow();
    expect(wholeCredits(0)).toBe(0);
    expect(wholeCredits("3")).toBe(3);
  });
});

describe("sessionRow", () => {
  const raw = { id: "s", user_id: "u", campaign_id: "c", summary_through_seq: "4", updated_at: "2026-01-01", opened_play_session: "yes", pending_roll: { garbage: true } };
  it("reads absent columns as null, a text seq as a number, and only a true flag as true", () => {
    const row = sessionRow(raw);
    expect([row.summary, row.left_at, row.fight_encounter_id, row.summary_through_seq, row.opened_play_session]).toEqual([null, null, null, 4, false]);
    expect(sessionRow({ ...raw, opened_play_session: true }).opened_play_session).toBe(true);
  });
  it("a pending roll this code did not write reads as nothing asked", () => {
    expect(sessionRow(raw).pending_roll).toBeNull();
  });
});

describe("prologueFrom", () => {
  const beat = { title: null, staged_at_location_id: "L", read_aloud: JSON.stringify({ type: "doc", content: [{ type: "text", text: "Rain." }] }) };
  it("is none once any turn was kept in the campaign", () => {
    expect(prologueFrom("q", "b", beat, 1)).toBeNull();
    expect(prologueFrom("q", "b", beat, 0)).not.toBeNull();
  });
  it("an untitled beat reads as an empty name and the read-aloud as plain text", () => {
    const p = prologueFrom("q", "b", beat, 0);
    expect([p?.beatTitle, p?.locationId, p?.readAloud]).toEqual(["", "L", "Rain."]);
  });
});

describe("nextSessionNumber and openedSession", () => {
  it("the next sitting is one after the last, or the first", () => {
    expect([nextSessionNumber({ number: 4 }), nextSessionNumber(null), nextSessionNumber({ number: null })]).toEqual([5, 1, 1]);
  });
  it("says whether this call opened the sitting or joined a running one, from a row or an array of one", () => {
    expect(openedSession([{ id: "s" }], [])).toEqual({ id: "s", opened: true });
    expect(openedSession({ id: "s" }, [{ id: "r" }])).toEqual({ id: "s", opened: false });
    expect(openedSession([], [])).toBeNull();
    expect(openedSession({ id: 5 }, null)).toBeNull();
  });
});
