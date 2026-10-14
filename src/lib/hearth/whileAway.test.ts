import { describe, expect, it } from "vitest";
import type { CharacterCaretaker } from "@/types/caretaker.types";
import type { PlayerSessionLabel } from "@/types/session.types";
import { awayHeadline, pickWhileAway, summariseAway, summarySentences, type AwayLine } from "./whileAway";

const NOW = new Date("2026-10-14T12:00:00Z");

function row(over: Partial<CharacterCaretaker>): CharacterCaretaker {
  return {
    id: "h1", campaign_id: "c", party_member_id: "pm", caretaker_user_id: "u2", granted_by: "u1",
    session_id: null, return_member_id: null, revoked_at: null, revoked_by: null,
    created_at: "2026-10-10T10:00:00Z", updated_at: "2026-10-10T10:00:00Z", ...over,
  };
}
const session = (over: Partial<PlayerSessionLabel>): PlayerSessionLabel => ({
  id: "s14", number: 14, title: null, played_on: null, started_at: null, ended_at: null, ...over,
});
const line = (over: Partial<AwayLine>): AwayLine => ({
  id: "l", type: "chat", message: "hi", created_at: "2026-10-10T11:00:00Z", metadata: null, ...over,
});

describe("pickWhileAway", () => {
  it("returns nothing for a character nobody minded", () => {
    expect(pickWhileAway([row({ party_member_id: "other" })], "pm", null, [], NOW)).toBeNull();
  });
  it("returns an active hand-over", () => {
    expect(pickWhileAway([row({})], "pm", null, [], NOW)?.active).toBe(true);
  });
  it("keeps a recently revoked one and drops an old one", () => {
    expect(pickWhileAway([row({ revoked_at: "2026-10-12T00:00:00Z" })], "pm", null, [], NOW)?.active).toBe(false);
    expect(pickWhileAway([row({ revoked_at: "2026-10-01T00:00:00Z" })], "pm", null, [], NOW)).toBeNull();
  });
  it("ends with its session", () => {
    const s = session({ ended_at: "2026-10-13T22:00:00Z" });
    const picked = pickWhileAway([row({ session_id: "s14" })], "pm", null, [s], NOW);
    expect(picked).toMatchObject({ active: false, endedAt: "2026-10-13T22:00:00Z", session: { id: "s14" } });
  });
  it("is active while its session is the open one", () => {
    expect(pickWhileAway([row({ session_id: "s14" })], "pm", "s14", [session({})], NOW)?.active).toBe(true);
  });
});

describe("summariseAway", () => {
  it("counts rolls, crits, fumbles and drops and keeps the newest notable lines", () => {
    const s = summariseAway([
      line({ id: "a", type: "roll", message: "Attack 20", metadata: { isCrit: true } }),
      line({ id: "b", type: "roll", message: "Save 2", metadata: { isFumble: true } }),
      line({ id: "c", type: "roll", message: "Stealth 11", metadata: { isCrit: false, isFumble: false } }),
      line({ id: "d", type: "item_drop" }),
      line({ id: "e", message: "We go left" }),
    ]);
    expect(s).toMatchObject({ lines: 5, rolls: 3, crits: 1, fumbles: 1, loot: 1 });
    expect(s.notable.map((n) => n.id)).toEqual(["a", "b", "e"]);
    expect(summarySentences(s, "Mira")).toBe("Three rolls, one a natural 20, one a fumble. One drop was put up for Mira.");
  });
  it("is empty for no lines", () => {
    expect(summarySentences(summariseAway([]), "Mira")).toBe("");
  });
});

describe("awayHeadline", () => {
  const base = { caretaker: "Tomas", character: "Mira", startedAt: "2026-10-10T10:00:00Z" };
  it("words the active and ended forms", () => {
    expect(awayHeadline({ ...base, active: true, session: null })).toBe("Tomas is looking after Mira");
    expect(awayHeadline({ ...base, active: false, session: session({}) })).toBe("Tomas looked after Mira in Session 14");
    expect(awayHeadline({ ...base, active: false, session: null })).toMatch(/^Tomas looked after Mira on \w+/);
  });
});
