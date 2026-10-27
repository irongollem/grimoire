import { describe, expect, it } from "vitest";
import { ANNOUNCEMENTS, pendingAnnouncements, type Announcement } from "@/lib/announcements";

const a = (id: string, publishedAt: string): Announcement => ({ id, title: id, body: "", publishedAt });

describe("pendingAnnouncements", () => {
  const all = [a("b", "2026-10-02"), a("a", "2026-09-01")];

  it("lists undismissed announcements oldest first", () => {
    expect(pendingAnnouncements(all, new Set(), "2026-01-01T00:00:00Z").map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("drops dismissed ones", () => {
    expect(pendingAnnouncements(all, new Set(["a"]), "2026-01-01T00:00:00Z").map((x) => x.id)).toEqual(["b"]);
  });

  it("skips announcements published before the account existed", () => {
    expect(pendingAnnouncements(all, new Set(), "2026-09-15T00:00:00Z").map((x) => x.id)).toEqual(["b"]);
  });

  it("shows an announcement to an account created before it, not to one created at the instant it was published", () => {
    const published = [a("p", "2026-10-02")];
    expect(pendingAnnouncements(published, new Set(), "2026-10-01T23:59:59Z")).toHaveLength(1);
    expect(pendingAnnouncements(published, new Set(), "2026-10-02T00:00:00Z")).toHaveLength(0);
  });

  it("shows everything when the account date is unknown", () => {
    expect(pendingAnnouncements(all, new Set(), null)).toHaveLength(2);
  });
});

describe("ANNOUNCEMENTS", () => {
  it("never reuses an id", () => {
    const ids = ANNOUNCEMENTS.map((x) => x.id);
    expect(ids.length).toBe(new Set(ids).size);
  });
});
