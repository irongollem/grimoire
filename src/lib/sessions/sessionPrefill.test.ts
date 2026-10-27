import { describe, expect, it } from "vitest";
import type { CampaignSession } from "@/types/session.types";
import type { SessionProposal } from "@/types/scheduling.types";
import {
  continuableSession,
  continueLabel,
  formatEndedAgo,
  formatSessionDay,
  lastPlayedSession,
  prefersContinue,
  nextSessionNumber,
  sortSessionLog,
  todaysScheduledSession,
} from "./sessionPrefill";

function row(patch: Partial<CampaignSession>): CampaignSession {
  return {
    id: "s",
    campaign_id: "c",
    user_id: "u",
    number: null,
    title: null,
    played_on: null,
    started_at: null,
    ended_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...patch,
  };
}

describe("nextSessionNumber", () => {
  it("is empty for an empty or unnumbered log", () => {
    expect(nextSessionNumber([])).toBeNull();
    expect(nextSessionNumber([row({})])).toBeNull();
  });
  it("is the highest number plus one, not the count", () => {
    expect(nextSessionNumber([row({ number: 3 }), row({ number: 14 }), row({})])).toBe(15);
  });
  it("continues from session zero", () => {
    expect(nextSessionNumber([row({ number: 0 })])).toBe(1);
  });
});

describe("sortSessionLog / lastPlayedSession", () => {
  const older = row({ id: "a", number: 13, started_at: "2026-09-20T19:00:00Z", ended_at: "2026-09-20T23:00:00Z" });
  const logged = row({ id: "b", number: 14, played_on: "2026-10-04" });
  const open = row({ id: "c", number: 15, started_at: "2026-10-06T19:00:00Z" });

  it("orders newest first across started and logged rows", () => {
    expect(sortSessionLog([older, open, logged]).map((s) => s.id)).toEqual(["c", "b", "a"]);
  });
  it("skips the running session when naming last time", () => {
    expect(lastPlayedSession([older, open, logged])?.id).toBe("b");
    expect(lastPlayedSession([open])).toBeNull();
  });
  it("counts a finished run as played, so it can be last time", () => {
    expect(lastPlayedSession([older, open])?.id).toBe("a");
  });
  it("places a row by its run before the day logged for it", () => {
    const both = row({ id: "both", started_at: "2026-10-10T19:00:00Z", played_on: "2026-09-01" });
    expect(sortSessionLog([logged, both]).map((s) => s.id)).toEqual(["both", "b"]);
  });
});

describe("formatSessionDay", () => {
  it("reads a logged date as a local calendar day", () => {
    expect(formatSessionDay(row({ played_on: "2026-10-04" }))).toBe("Sunday 4 October");
  });
});

describe("todaysScheduledSession", () => {
  const p = (patch: Partial<SessionProposal>) =>
    ({ id: "p", proposed_date: "2026-10-06", status: "confirmed", title: "The Mere", ...patch }) as SessionProposal;
  it("picks the confirmed proposal dated today", () => {
    expect(todaysScheduledSession([p({ id: "x", status: "proposed" }), p({ id: "y" })], "2026-10-06")?.id).toBe("y");
  });
  it("ignores other days", () => {
    expect(todaysScheduledSession([p({ proposed_date: "2026-10-07" })], "2026-10-06")).toBeNull();
  });
});

describe("continuableSession", () => {
  const older = row({ id: "a", number: 13, started_at: "2026-09-20T19:00:00Z", ended_at: "2026-09-20T23:00:00Z" });
  const ended = row({ id: "b", number: 14, started_at: "2026-10-06T19:00:00Z", ended_at: "2026-10-06T21:00:00Z" });
  const logged = row({ id: "c", number: 15, played_on: "2026-10-07" });

  it("offers the most recent run once it has ended", () => {
    expect(continuableSession([older, ended])?.id).toBe("b");
  });
  it("skips a session logged by hand, which had no run", () => {
    expect(continuableSession([older, ended, logged])?.id).toBe("b");
  });
  it("offers nothing while a session is open", () => {
    expect(continuableSession([older, row({ id: "d", started_at: "2026-10-08T19:00:00Z" })])).toBeNull();
  });
  it("offers nothing in a log that was never run", () => {
    expect(continuableSession([logged])).toBeNull();
  });
});

describe("prefersContinue", () => {
  const at = (iso: string) => Date.parse(iso);
  const tonight = { started_at: "2026-10-06T19:00:00Z", ended_at: "2026-10-06T21:00:00Z" };

  it("continues after a break at the table", () => {
    expect(prefersContinue(tonight, at("2026-10-06T21:40:00Z"))).toBe(true);
  });
  it("a break of exactly four hours still continues, a moment more does not", () => {
    expect(prefersContinue(tonight, at("2026-10-07T01:00:00Z"))).toBe(true);
    expect(prefersContinue(tonight, at("2026-10-07T01:00:00.001Z"))).toBe(false);
  });
  it("a run begun exactly a day ago still continues, a moment more does not", () => {
    const longDay = { started_at: "2026-10-06T00:00:00Z", ended_at: "2026-10-06T23:30:00Z" };
    expect(prefersContinue(longDay, at("2026-10-07T00:00:00Z"))).toBe(true);
    expect(prefersContinue(longDay, at("2026-10-07T00:00:00.001Z"))).toBe(false);
  });
  it("starts afresh once the break is longer than an evening's", () => {
    expect(prefersContinue(tonight, at("2026-10-07T01:30:00Z"))).toBe(false);
  });
  it("starts afresh after a forgotten session, however recently it was closed", () => {
    const forgotten = { started_at: "2026-10-02T19:00:00Z", ended_at: "2026-10-05T15:00:00Z" };
    expect(prefersContinue(forgotten, at("2026-10-05T16:00:00Z"))).toBe(false);
  });
  it("continues a long evening that \"Still playing?\" ended by mistake", () => {
    const marathon = { started_at: "2026-10-06T12:00:00Z", ended_at: "2026-10-06T19:00:00Z" };
    expect(prefersContinue(marathon, at("2026-10-06T19:05:00Z"))).toBe(true);
  });
  it("has no opinion about a session that is running or was never run", () => {
    expect(prefersContinue({ started_at: "2026-10-06T19:00:00Z", ended_at: null })).toBe(false);
    expect(prefersContinue({ started_at: null, ended_at: null })).toBe(false);
  });
});

describe("continueLabel / formatEndedAgo", () => {
  it("names the session it continues", () => {
    expect(continueLabel({ number: 14 })).toBe("Continue session 14");
    expect(continueLabel({ number: null })).toBe("Continue session");
    expect(continueLabel({ number: 0 })).toBe("Continue session 0");
  });
  const ended = row({ started_at: "2026-10-06T19:00:00Z", ended_at: "2026-10-06T21:00:00Z" });
  const at = (iso: string) => Date.parse(iso);
  it("says how long the break has been", () => {
    expect(formatEndedAgo(ended, at("2026-10-06T21:00:30Z"))).toBe("ended just now");
    expect(formatEndedAgo(ended, at("2026-10-06T21:01:00Z"))).toBe("ended 1 minute ago");
    expect(formatEndedAgo(ended, at("2026-10-06T21:20:00Z"))).toBe("ended 20 minutes ago");
    expect(formatEndedAgo(ended, at("2026-10-06T22:00:00Z"))).toBe("ended 1 hour ago");
    expect(formatEndedAgo(ended, at("2026-10-06T21:59:00Z"))).toBe("ended 59 minutes ago");
    expect(formatEndedAgo(ended, at("2026-10-06T23:30:00Z"))).toBe("ended 2 hours ago");
    expect(formatEndedAgo(ended, at("2026-10-07T20:59:00Z"))).toBe("ended 23 hours ago");
  });
  it("says nothing for a session that has not ended, or an end that is not a date", () => {
    expect(formatEndedAgo({ ...ended, ended_at: null })).toBe("");
    expect(formatEndedAgo({ ...ended, ended_at: "not a date" })).toBe("");
  });
  it("names the day once it was another day", () => {
    expect(formatEndedAgo(ended, at("2026-10-07T21:00:00Z"))).toBe("played Tuesday 6 October");
    expect(formatEndedAgo(ended, at("2026-10-09T20:00:00Z"))).toBe("played Tuesday 6 October");
  });
});
