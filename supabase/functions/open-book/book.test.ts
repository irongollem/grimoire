import { describe, expect, it } from "vitest";
import {
  firstImageSrc,
  type BookRow,
  buildBody,
  buildFull,
  canServe,
  isNotModified,
  makeEtag,
  parsePart,
  parseSlug,
  type ReleaseRow,
  type ServeFacts,
  toMeta,
} from "./book.ts";

const book: BookRow = {
  slug: "curse-of-strahd",
  is_open: true,
  allow_pdf: true,
  indexable: false,
  live_release_id: "rel-1",
  updated_at: "2026-10-23T10:00:00Z",
};
const release: ReleaseRow = {
  id: "rel-1",
  number: 3,
  note: "Act one",
  created_at: "2026-10-22T10:00:00Z",
  pdf_url: null,
  stats: { places: 2 },
  snapshot: {
    v: 1,
    book: { title: "T" },
    calendar: { calendar_id: null },
    places: [{ id: "p" }],
    sessions: [
      { id: "s1", title: "Arrival", session: { number: 1 } },
      { id: "s2", title: "Loose note", session: null },
    ],
  },
};
const ok: ServeFacts = { book, release, ownerId: "u1", ownerIsChild: false, ownerIsPro: true };

describe("parseSlug", () => {
  it("takes the last path segment", () => {
    expect(parseSlug("/functions/v1/open-book/curse-of-strahd")).toBe("curse-of-strahd");
    expect(parseSlug("/open-book/a")).toBe("a");
  });
  it.each(["", "/", "/open-book/Bad", "/open-book/-x", "/open-book/x-", "/open-book/a_b", `/open-book/${"a".repeat(49)}`])(
    "rejects %s",
    (p) => expect(parseSlug(p)).toBeNull(),
  );
  it("accepts the longest slug", () => {
    expect(parseSlug(`/x/${"a".repeat(48)}`)).toBe("a".repeat(48));
  });
});

describe("parsePart", () => {
  it("defaults to full", () => {
    expect(parsePart("")).toBe("full");
    expect(parsePart("?part=other")).toBe("full");
  });
  it("reads meta", () => expect(parsePart("?part=meta")).toBe("meta"));
});

describe("canServe", () => {
  it("serves the happy path", () => expect(canServe(ok)).toBe(true));
  it.each<[string, Partial<ServeFacts>]>([
    ["no book", { book: null }],
    ["closed", { book: { ...book, is_open: false } }],
    ["no live release id", { book: { ...book, live_release_id: null } }],
    ["no release", { release: null }],
    ["release mismatch", { release: { ...release, id: "other" } }],
    ["no owner", { ownerId: null }],
    ["child owner", { ownerIsChild: true }],
    ["child check failed", { ownerIsChild: null }],
    ["not pro", { ownerIsPro: false }],
    ["pro check failed", { ownerIsPro: null }],
  ])("refuses: %s", (_n, patch) => expect(canServe({ ...ok, ...patch })).toBe(false));
});

describe("buildBody / toMeta", () => {
  it("returns exactly the public columns", () => {
    const body = buildBody(book, release, "full") as unknown as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["allow_pdf", "indexable", "release", "slug", "snapshot"]);
    expect(Object.keys(body.release as object).sort()).toEqual(["created_at", "note", "number", "pdf_url", "stats"]);
    expect(JSON.stringify(body)).not.toContain("rel-1");
  });
  it("reduces the snapshot for meta and lists sessions", () => {
    const meta = buildBody(book, release, "meta") as ReturnType<typeof toMeta>;
    expect(meta.snapshot).toEqual({ v: 1, book: { title: "T" }, calendar: { calendar_id: null } });
    expect(meta.sessions).toEqual([
      { id: "s1", title: "Arrival", number: 1, image: null },
      { id: "s2", title: "Loose note", number: null, image: null },
    ]);
    expect(meta.release.number).toBe(3);
  });
  it("tolerates a snapshot with no sessions", () => {
    const meta = toMeta(buildBody(book, { ...release, snapshot: { v: 1 } }, "full") as never);
    expect(meta.sessions).toEqual([]);
  });
});

describe("etag", () => {
  it("varies by release, updated_at and part", () => {
    const a = makeEtag("r1", "2026-10-23T10:00:00Z", "full");
    expect(a).not.toBe(makeEtag("r2", "2026-10-23T10:00:00Z", "full"));
    expect(a).not.toBe(makeEtag("r1", "2026-10-23T10:00:01Z", "full"));
    expect(a).not.toBe(makeEtag("r1", "2026-10-23T10:00:00Z", "meta"));
    expect(a).toBe(makeEtag("r1", "2026-10-23T10:00:00Z", "full"));
  });
  it("matches If-None-Match in its forms", () => {
    const e = makeEtag("r1", "2026-10-23T10:00:00Z", "full");
    expect(isNotModified(e, e)).toBe(true);
    expect(isNotModified(`W/${e}`, e)).toBe(true);
    expect(isNotModified(`"x", ${e}`, e)).toBe(true);
    expect(isNotModified("*", e)).toBe(true);
    expect(isNotModified('"other"', e)).toBe(false);
    expect(isNotModified(null, e)).toBe(false);
  });
});

describe("firstImageSrc", () => {
  it("drops a PDF link that is not https", () => {
    for (const [url, expected] of [
      ["javascript:alert(1)", null],
      ["http://cdn.example/a.pdf", null],
      ["https://cdn.example/a.pdf", "https://cdn.example/a.pdf"],
    ] as const) {
      expect(buildFull(book, { ...release, pdf_url: url }).release.pdf_url).toBe(expected);
    }
  });

  it("finds the first https picture in document order, at any depth", () => {
    const doc = JSON.stringify({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "x" }] },
        { type: "aiGenerated", content: [{ type: "image", attrs: { src: "https://cdn.example/a.webp" } }] },
        { type: "image", attrs: { src: "https://cdn.example/b.webp" } },
      ],
    });
    expect(firstImageSrc(doc)).toBe("https://cdn.example/a.webp");
  });
  it("ignores non-https sources, plain text and empty content", () => {
    expect(firstImageSrc(JSON.stringify({ type: "doc", content: [{ type: "image", attrs: { src: "data:image/png;base64,AA" } }] }))).toBeNull();
    expect(firstImageSrc("just prose")).toBeNull();
    expect(firstImageSrc(null)).toBeNull();
  });
});
