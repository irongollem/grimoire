import { describe, expect, it } from "vitest";
import { restoreSessions } from "./backupSessions";

describe("restoreSessions", () => {
  const idMap = new Map([["s-old", "s-new"]]);

  it("remaps the log and points notes at the restored sessions", () => {
    const { sessions, notes } = restoreSessions(
      {
        campaign_sessions: [{ id: "s-old", campaign_id: "x", user_id: "y", number: 3, started_at: null, ended_at: null }],
        notes: [{ id: "n", category: "session", session_id: "s-old" }, { id: "g", category: "general" }],
      },
      idMap, "camp", "me",
    );
    expect(sessions).toEqual([expect.objectContaining({ id: "s-new", campaign_id: "camp", user_id: "me", number: 3 })]);
    expect(notes.map((n) => n.session_id)).toEqual(["s-new", null]);
  });

  it("closes a session that was running when the backup was taken", () => {
    const { sessions } = restoreSessions(
      { campaign_sessions: [{ id: "s-old", started_at: "2026-10-01T18:00:00Z", ended_at: null }], notes: [] },
      idMap, "camp", "me",
    );
    expect(sessions[0].ended_at).toBe("2026-10-01T18:00:00Z");
  });

  it("turns a legacy numbered session note into a session", () => {
    const { sessions, notes } = restoreSessions(
      {
        notes: [{
          id: "n", category: "session", session_num: 7, title: " Ashes ",
          session_real_date: "2026-05-02", created_at: "2026-06-01T10:00:00Z",
        }],
      },
      new Map(), "camp", "me",
    );
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ campaign_id: "camp", number: 7, title: "Ashes", played_on: "2026-05-02" });
    expect(notes[0].session_id).toBe(sessions[0].id);
    expect(notes[0]).not.toHaveProperty("session_num");
  });

  it("dates a legacy note by the day it was written when it has no real date", () => {
    const { sessions } = restoreSessions(
      { notes: [{ id: "n", category: "session", session_num: 1, title: "", created_at: "2026-06-01T10:00:00Z" }] },
      new Map(), "camp", "me",
    );
    expect(sessions[0]).toMatchObject({ title: null, played_on: "2026-06-01" });
  });
});
