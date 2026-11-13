import { describe, expect, it } from "vitest";
import { markSessionLabel, resolveMarkSessionId } from "./markSession";
import type { CampaignSession } from "@/types/session.types";

const row = (id: string, over: Partial<CampaignSession> = {}): CampaignSession => ({
  id, campaign_id: "c", user_id: "u", number: null, title: null, played_on: null,
  started_at: null, ended_at: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", ...over,
});
const old = row("s1", { number: 1, started_at: "2026-02-01T18:00:00Z", ended_at: "2026-02-01T22:00:00Z" });
const recent = row("s2", { number: 2, started_at: "2026-03-01T18:00:00Z", ended_at: "2026-03-01T22:00:00Z" });
const open = row("s3", { number: 3, started_at: "2026-04-01T18:00:00Z" });

describe("resolveMarkSessionId", () => {
  // Fails if the default ignores the running session and files marks under last week's.
  it("defaults to the open session", () => {
    expect(resolveMarkSessionId([old, recent, open], "s3", "")).toBe("s3");
  });

  // Fails if "latest" is picked by log order or the open row is counted as played.
  it("falls back to the most recently played session when none is open", () => {
    expect(resolveMarkSessionId([old, recent], null, "")).toBe("s2");
  });

  it("is null for an empty log", () => {
    expect(resolveMarkSessionId([], null, "")).toBeNull();
  });

  // Fails if the DM's pick is overridden by the default.
  it("honours the DM's choice over the default", () => {
    expect(resolveMarkSessionId([old, recent, open], "s3", "s1")).toBe("s1");
  });

  // Fails if a pick for a deleted session is sent to the server as a dead id.
  it("ignores a choice that names a session no longer in the log", () => {
    expect(resolveMarkSessionId([old, recent], null, "gone")).toBe("s2");
  });
});

describe("markSessionLabel", () => {
  it("names a numbered session by number and an unnumbered one by title", () => {
    expect(markSessionLabel({ number: 12, title: "The mill" })).toBe("Session 12");
    expect(markSessionLabel({ number: null, title: "A one-shot" })).toBe("A one-shot");
  });
});
