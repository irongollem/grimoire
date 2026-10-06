import { describe, expect, it } from "vitest";
import type { CampaignSession } from "@/types/session.types";
import type { SessionProposal } from "@/types/scheduling.types";
import {
  formatSessionDay,
  lastPlayedSession,
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
