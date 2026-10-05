import { describe, expect, it } from "vitest";
import { canEditSessionNote, findSessionNote, sessionNoteTitle } from "./sessionNote";

const entry = (title: string | null, category: string, created_at: string) => ({
  category: category as "session",
  title,
  created_at,
});

describe("sessionNoteTitle", () => {
  it("carries the prefix and the local date", () => {
    expect(sessionNoteTitle(new Date(2026, 9, 5))).toMatch(/^Session notes · .*2026/);
  });
});

describe("findSessionNote", () => {
  const started = "2026-10-05T18:00:00Z";

  it("is null without a session or entries", () => {
    expect(findSessionNote([], started)).toBeNull();
    expect(findSessionNote(undefined, started)).toBeNull();
    expect(findSessionNote([entry("Session notes · x", "session", started)], null)).toBeNull();
  });

  it("picks the newest Hearth note made since the start", () => {
    const older = entry("Session notes · a", "session", "2026-10-05T18:10:00Z");
    const newer = entry("Session notes · b", "session", "2026-10-05T19:10:00Z");
    expect(findSessionNote([older, newer], started)).toBe(newer);
  });

  it("ignores earlier sittings, other categories and hand-made titles", () => {
    expect(
      findSessionNote(
        [
          entry("Session notes · old", "session", "2026-10-04T20:00:00Z"),
          entry("Session notes · x", "clue", "2026-10-05T19:00:00Z"),
          entry("My own recap", "session", "2026-10-05T19:00:00Z"),
          entry(null, "session", "2026-10-05T19:00:00Z"),
        ],
        started,
      ),
    ).toBeNull();
  });
});

describe("canEditSessionNote", () => {
  it("opens only once the journal has loaded and the session start is known", () => {
    expect(canEditSessionNote(true, "2026-10-05T19:00:00Z")).toBe(true);
    expect(canEditSessionNote(false, "2026-10-05T19:00:00Z")).toBe(false);
    expect(canEditSessionNote(true, null)).toBe(false);
    expect(canEditSessionNote(false, null)).toBe(false);
  });
});
