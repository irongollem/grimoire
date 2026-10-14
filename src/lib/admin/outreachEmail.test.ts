import { beforeEach, describe, expect, it, vi } from "vitest";
import { DISCORD_URL } from "@/lib/marketing";
import {
  DEFAULT_OUTREACH_TEMPLATE,
  NO_HIGHLIGHTS_LINE,
  OUTREACH_STORAGE_KEY,
  loadOutreachTemplate,
  outreachMailto,
  pickHighlights,
  renderOutreach,
  resetOutreachTemplate,
  saveOutreachTemplate,
} from "./outreachEmail";

const ALL = [
  { releasedAt: "2026-01-10", line: "old" },
  { releasedAt: "2026-06-01", line: "mid" },
  { releasedAt: "2026-09-01", line: "newer" },
  { releasedAt: "2026-10-01", line: "newest" },
];

describe("pickHighlights", () => {
  it("keeps only releases strictly after the last visit, newest first", () => {
    expect(pickHighlights("2026-01-10T00:00:00Z", ALL).map((h) => h.line)).toEqual(["newest", "newer", "mid"]);
  });
  it("excludes a release on the same instant", () => {
    expect(pickHighlights("2026-06-01T00:00:00Z", ALL).map((h) => h.line)).toEqual(["newest", "newer"]);
  });
  it("caps the list", () => {
    expect(pickHighlights("2025-01-01T00:00:00Z", ALL, 2).map((h) => h.line)).toEqual(["newest", "newer"]);
  });
  it("is empty when nothing is newer", () => {
    expect(pickHighlights("2026-11-01T00:00:00Z", ALL)).toEqual([]);
  });
});

describe("renderOutreach", () => {
  const user = { display_name: "Mira", created_at: "2026-05-03T10:00:00Z", last_active_at: "2026-10-05T10:00:00Z" };

  it("substitutes every placeholder", () => {
    const mail = renderOutreach(DEFAULT_OUTREACH_TEMPLATE, user);
    expect(mail.body).toContain("Hi Mira,");
    expect(mail.body).toContain("in May 2026");
    expect(mail.body).toContain("was October 2026");
    expect(mail.body).toContain(DISCORD_URL);
    expect(mail.body).not.toContain("{{");
    expect(mail.subject).toBe(DEFAULT_OUTREACH_TEMPLATE.subject);
  });

  it("falls back to 'there' without a name", () => {
    expect(renderOutreach(DEFAULT_OUTREACH_TEMPLATE, { ...user, display_name: null }).body).toContain("Hi there,");
  });

  it("lists highlights as dashed lines", () => {
    const mail = renderOutreach(
      { subject: "s", body: "{{highlights}}" },
      { ...user, last_active_at: "2026-10-05T10:00:00Z" });
    expect(mail.body.split("\n").every((l) => l.startsWith("- "))).toBe(true);
  });

  it("uses a generic line when nothing newer shipped", () => {
    const mail = renderOutreach({ subject: "s", body: "{{highlights}}" }, { ...user, last_active_at: "2099-01-01T00:00:00Z" });
    expect(mail.body).toBe(`- ${NO_HIGHLIGHTS_LINE}`);
  });

  it("leaves unknown placeholders alone", () => {
    expect(renderOutreach({ subject: "{{nope}}", body: "" }, user).subject).toBe("{{nope}}");
  });
});

describe("outreachMailto", () => {
  it("encodes spaces as %20 and never uses +", () => {
    const url = outreachMailto("a@b.com", { subject: "Hello there", body: "line one\nline two" });
    expect(url).toBe("mailto:a%40b.com?subject=Hello%20there&body=line%20one%0Aline%20two");
    expect(url).not.toContain("+");
  });
});

describe("template storage", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
  });

  it("defaults when nothing is stored", () => {
    expect(loadOutreachTemplate()).toEqual(DEFAULT_OUTREACH_TEMPLATE);
  });
  it("round-trips a saved template and resets it", () => {
    saveOutreachTemplate({ subject: "S", body: "B" });
    expect(loadOutreachTemplate()).toEqual({ subject: "S", body: "B" });
    expect(resetOutreachTemplate()).toEqual(DEFAULT_OUTREACH_TEMPLATE);
    expect(loadOutreachTemplate()).toEqual(DEFAULT_OUTREACH_TEMPLATE);
  });
  it("falls back on malformed JSON or the wrong shape", () => {
    localStorage.setItem(OUTREACH_STORAGE_KEY, "{nope");
    expect(loadOutreachTemplate()).toEqual(DEFAULT_OUTREACH_TEMPLATE);
    localStorage.setItem(OUTREACH_STORAGE_KEY, JSON.stringify({ subject: 1 }));
    expect(loadOutreachTemplate()).toEqual(DEFAULT_OUTREACH_TEMPLATE);
  });
});
