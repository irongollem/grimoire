import { describe, it, expect } from "vitest";
import {
  parseSignUploadRequest,
  parseDeleteRequest,
  parseListRequest,
  authorizeUploads,
  authorizeDeletes,
  authorizeList,
  MAX_UPLOAD_OBJECTS,
  MAX_DELETE_PATHS,
} from "./api.ts";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const CALLER = { userId: USER, isAdmin: false };
const ADMIN = { userId: USER, isAdmin: true };

// Every registry bucket is R2-backed (see config.ts). `sounds` carries the
// widest client-reachable rule set — its own MIME allowlist plus the admin-only
// `library/` catalogue prefix — so it anchors most cases here. mini-models is
// service-managed (clientWrites: false) and appears only in refusal tests.
const R2_BUCKET = "sounds";
const ADMIN_PREFIX_PATH = "library/rain.ogg";

const object = (path: string, over: Partial<{ contentType: string; size: number }> = {}) => ({
  path,
  contentType: "audio/ogg",
  size: 1024,
  ...over,
});

describe("parseSignUploadRequest", () => {
  it("accepts a well-formed request", () => {
    const result = parseSignUploadRequest({
      bucket: R2_BUCKET,
      objects: [object(`${USER}/m/a.ogg`)],
    });
    expect(result).toEqual({
      ok: true,
      value: { bucket: R2_BUCKET, objects: [object(`${USER}/m/a.ogg`)] },
    });
  });

  it("refuses a bucket that is not R2-backed", () => {
    // bug-reports and downtime-images are written outside the bucket registry.
    // Signing an R2 PUT for one would write bytes no read path looks at, and the
    // caller would persist a URL pointing at nothing.
    for (const bucket of ["bug-reports", "downtime-images", "tile-packs"]) {
      const result = parseSignUploadRequest({ bucket, objects: [object(`${USER}/a.webp`)] });
      expect(result).toEqual({ ok: false, error: expect.stringContaining("not served from R2") });
    }
  });

  it("refuses junk bodies", () => {
    for (const body of [null, "x", 42, [], undefined, {}]) {
      expect(parseSignUploadRequest(body).ok).toBe(false);
    }
  });

  it("refuses an empty or oversized objects array", () => {
    expect(parseSignUploadRequest({ bucket: R2_BUCKET, objects: [] }).ok).toBe(false);
    const many = Array.from({ length: MAX_UPLOAD_OBJECTS + 1 }, (_, i) => object(`${USER}/${i}.stl`));
    expect(parseSignUploadRequest({ bucket: R2_BUCKET, objects: many }).ok).toBe(false);
  });

  it("refuses a missing or mistyped field on any object", () => {
    const bad = [
      { contentType: "model/stl", size: 1 },
      { path: `${USER}/a.stl`, size: 1 },
      { path: `${USER}/a.stl`, contentType: "model/stl" },
      { path: `${USER}/a.stl`, contentType: "model/stl", size: "1" },
      { path: "", contentType: "model/stl", size: 1 },
    ];
    for (const entry of bad) {
      expect(parseSignUploadRequest({ bucket: R2_BUCKET, objects: [entry] }).ok).toBe(false);
    }
  });

  it("refuses duplicate paths in one request", () => {
    const dup = object(`${USER}/a.stl`);
    expect(parseSignUploadRequest({ bucket: R2_BUCKET, objects: [dup, { ...dup }] }).ok).toBe(false);
  });
});

describe("mini-models stays service-managed through the client API", () => {
  // Parsing accepts the bucket (it IS R2-backed — the service pipeline writes
  // it), but authorization refuses every client path: this is the RLS
  // "SELECT-only policies" restriction, ported. Without it, any authenticated
  // user could presign 50 MB PUTs and bypass the mini_sculpt credit charge.
  it("refuses uploads for any caller, admin included", () => {
    const request = {
      bucket: "mini-models",
      objects: [{ path: `${USER}/m/model.stl`, contentType: "model/stl", size: 1024 }],
    };
    const parsed = parseSignUploadRequest(request);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(authorizeUploads(parsed.value, CALLER).allowed).toBe(false);
      expect(authorizeUploads(parsed.value, ADMIN).allowed).toBe(false);
    }
  });

  it("refuses deletes for any caller — cleanup goes through forge-mini", () => {
    const request = { bucket: "mini-models", paths: [`${USER}/m/model.stl`] };
    const parsed = parseDeleteRequest(request);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(authorizeDeletes(parsed.value, CALLER).allowed).toBe(false);
      expect(authorizeDeletes(parsed.value, ADMIN).allowed).toBe(false);
    }
  });
});

describe("parseDeleteRequest", () => {
  it("accepts and de-duplicates paths", () => {
    const result = parseDeleteRequest({
      bucket: R2_BUCKET,
      paths: [`${USER}/a.stl`, `${USER}/a.stl`, `${USER}/b.stl`],
    });
    expect(result).toEqual({ ok: true, value: { bucket: R2_BUCKET, paths: [`${USER}/a.stl`, `${USER}/b.stl`] } });
  });

  it("refuses empty, oversized and non-string path lists", () => {
    expect(parseDeleteRequest({ bucket: R2_BUCKET, paths: [] }).ok).toBe(false);
    expect(parseDeleteRequest({ bucket: R2_BUCKET, paths: [1, 2] }).ok).toBe(false);
    expect(parseDeleteRequest({ bucket: R2_BUCKET, paths: [""] }).ok).toBe(false);
    const many = Array.from({ length: MAX_DELETE_PATHS + 1 }, (_, i) => `${USER}/${i}.stl`);
    expect(parseDeleteRequest({ bucket: R2_BUCKET, paths: many }).ok).toBe(false);
  });

  it("refuses a bucket that is not R2-backed", () => {
    expect(parseDeleteRequest({ bucket: "bug-reports", paths: [`${USER}/a.png`] }).ok).toBe(false);
  });

  it("accepts the registry buckets that moved to R2", () => {
    expect(parseDeleteRequest({ bucket: "sounds", paths: [`${USER}/a.ogg`] }).ok).toBe(true);
    expect(parseDeleteRequest({ bucket: "npc-portraits", paths: [`${USER}/a.webp`] }).ok).toBe(true);
  });
});

describe("authorizeUploads", () => {
  const request = (paths: string[]) => ({ bucket: R2_BUCKET, objects: paths.map((p) => object(p)) });

  it("allows a caller's own paths", () => {
    expect(authorizeUploads(request([`${USER}/m/model.stl`, `${USER}/m/preview.webp`]), CALLER).allowed).toBe(true);
  });

  it("fails the whole batch when any single path is unauthorized", () => {
    // All-or-nothing: a partial success would upload an original whose variants
    // were refused, leaving permanently broken variant URLs in the DB.
    const result = authorizeUploads(request([`${USER}/ok.stl`, `${OTHER}/nope.stl`]), CALLER);
    expect(result.allowed).toBe(false);
  });

  it("fails the whole batch when any single object breaks the MIME or size rule", () => {
    const mixed = {
      bucket: R2_BUCKET,
      objects: [object(`${USER}/a.stl`), object(`${USER}/b.stl`, { contentType: "text/html" })],
    };
    expect(authorizeUploads(mixed, CALLER).allowed).toBe(false);
  });

  it("lets an admin write the shared library/ catalogue prefix but not a user", () => {
    expect(authorizeUploads(request([ADMIN_PREFIX_PATH]), ADMIN).allowed).toBe(true);
    expect(authorizeUploads(request([ADMIN_PREFIX_PATH]), CALLER).allowed).toBe(false);
  });
});

describe("authorizeDeletes", () => {
  it("allows a caller's own paths and refuses the batch otherwise", () => {
    expect(authorizeDeletes({ bucket: R2_BUCKET, paths: [`${USER}/a.stl`] }, CALLER).allowed).toBe(true);
    expect(
      authorizeDeletes({ bucket: R2_BUCKET, paths: [`${USER}/a.stl`, `${OTHER}/b.stl`] }, CALLER).allowed,
    ).toBe(false);
  });

  it("protects shared content from a non-admin delete", () => {
    // The #577 criterion: deleting a catalogue-sourced asset must not be possible
    // from an ordinary user's cleanup path.
    expect(authorizeDeletes({ bucket: R2_BUCKET, paths: [ADMIN_PREFIX_PATH] }, CALLER).allowed).toBe(false);
    expect(authorizeDeletes({ bucket: R2_BUCKET, paths: [ADMIN_PREFIX_PATH] }, ADMIN).allowed).toBe(true);
  });
});

describe("r2-list parsing and authorization", () => {
  it("accepts a caller listing their own prefix", () => {
    const parsed = parseListRequest({ bucket: R2_BUCKET, prefix: USER });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(authorizeList(parsed.value, CALLER).allowed).toBe(true);
  });

  it("refuses another user's prefix — enumeration is owner-gated like the SELECT policies", () => {
    const parsed = parseListRequest({ bucket: R2_BUCKET, prefix: OTHER });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(authorizeList(parsed.value, CALLER).allowed).toBe(false);
      // Admin is not a listing skeleton key either.
      expect(authorizeList(parsed.value, ADMIN).allowed).toBe(false);
    }
  });

  it("refuses a prefix that merely starts with the caller's uuid", () => {
    const parsed = parseListRequest({ bucket: R2_BUCKET, prefix: `${USER}-evil` });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(authorizeList(parsed.value, CALLER).allowed).toBe(false);
  });

  it("refuses malformed prefixes and non-R2 buckets at parse time", () => {
    for (const body of [
      { bucket: R2_BUCKET, prefix: "" },
      { bucket: R2_BUCKET, prefix: "/u1" },
      { bucket: R2_BUCKET, prefix: "u1/" },
      { bucket: R2_BUCKET, prefix: "u1//x" },
      { bucket: "bug-reports", prefix: USER },
      { prefix: USER },
      null,
    ]) {
      expect(parseListRequest(body).ok).toBe(false);
    }
  });

  it("refuses listing a service-managed bucket", () => {
    const parsed = parseListRequest({ bucket: "mini-models", prefix: USER });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(authorizeList(parsed.value, CALLER).allowed).toBe(false);
      expect(authorizeList(parsed.value, ADMIN).allowed).toBe(false);
    }
  });
});
