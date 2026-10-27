import { describe, expect, it } from "vitest";
import type { OpenBookSession } from "@/types/openBook.types";
import { firstImageSrc, newestSession, shareSessionOf } from "./shareSession";

const session = (extra: Partial<OpenBookSession>): OpenBookSession => ({
  id: "s",
  title: "Untitled",
  content: null,
  tags: null,
  session: null,
  date: null,
  real_date: null,
  created_at: "2026-01-01T00:00:00Z",
  ...extra,
});

const doc = (src: string) =>
  JSON.stringify({ type: "doc", content: [{ type: "paragraph" }, { type: "image", attrs: { src } }] });

describe("firstImageSrc", () => {
  it("finds the first image", () => expect(firstImageSrc(doc("https://x/a.png"))).toBe("https://x/a.png"));
  it("ignores a picture that is not a web address", () => {
    expect(firstImageSrc(doc("javascript:alert(1)"))).toBeNull();
    expect(firstImageSrc(doc("/relative.png"))).toBeNull();
    expect(firstImageSrc(doc("data:image/png;base64,AAAA"))).toBeNull();
  });
  it("finds a picture nested inside other nodes", () => {
    const nested = JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "image", attrs: { src: "https://x/n.png" } }] }] });
    expect(firstImageSrc(nested)).toBe("https://x/n.png");
  });
  it("is null without content, images or valid JSON", () => {
    expect(firstImageSrc(null)).toBeNull();
    expect(firstImageSrc(JSON.stringify({ type: "doc", content: [] }))).toBeNull();
    expect(firstImageSrc("not json")).toBeNull();
  });
});

describe("newestSession", () => {
  it("is null for none", () => expect(newestSession([])).toBeNull());
  it("prefers the highest number", () => {
    const a = session({ id: "a", session: { number: 3, title: null, played_on: null } });
    const b = session({ id: "b", session: { number: 14, title: null, played_on: null } });
    expect(newestSession([b, a])?.id).toBe("b");
    expect(newestSession([a, b])?.id).toBe("b");
  });
  it("prefers a numbered session over an unnumbered one however new, in either order", () => {
    const numbered = session({ id: "n", created_at: "2026-01-01T00:00:00Z", session: { number: 2, title: null, played_on: null } });
    const loose = session({ id: "l", created_at: "2026-09-01T00:00:00Z" });
    expect(newestSession([numbered, loose])?.id).toBe("n");
    expect(newestSession([loose, numbered])?.id).toBe("n");
  });
  it("breaks a tie on the same number by the later created", () => {
    const early = session({ id: "e", created_at: "2026-01-01T00:00:00Z", session: { number: 5, title: null, played_on: null } });
    const late = session({ id: "t", created_at: "2026-02-01T00:00:00Z", session: { number: 5, title: null, played_on: null } });
    expect(newestSession([early, late])?.id).toBe("t");
    expect(newestSession([late, early])?.id).toBe("t");
  });
  it("falls back to the latest created", () => {
    const a = session({ id: "a", created_at: "2026-02-01T00:00:00Z" });
    const b = session({ id: "b", created_at: "2026-03-01T00:00:00Z" });
    expect(newestSession([a, b])?.id).toBe("b");
  });
});

describe("shareSessionOf", () => {
  it("is null with no sessions", () => expect(shareSessionOf([], "Book")).toBeNull());
  it("has no numeral on the kicker of a session without a number, and falls back to the raw title", () => {
    expect(shareSessionOf([session({ title: "The Descent" })], "Ashfall")).toEqual({
      kicker: "SESSION · ASHFALL", title: "The Descent", imageUrl: null,
    });
  });
  it("names the session, the book and the lead picture", () => {
    const s = session({ title: "Fallback", content: doc("https://x/a.png"), session: { number: 14, title: "The Drowned Bell", played_on: null } });
    expect(shareSessionOf([s], "Ashfall")).toEqual({
      kicker: "SESSION XIV · ASHFALL",
      title: "The Drowned Bell",
      imageUrl: "https://x/a.png",
    });
  });
});
