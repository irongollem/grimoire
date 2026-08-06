import { describe, it, expect } from "vitest";
import {
  STORAGE_WRITE_POLICY,
  bucketWritePolicy,
  authorizePath,
  authorizeUpload,
} from "./storage-policy.ts";

// This module replaces RLS for every bucket that moves to R2, so the tests are
// written as the acceptance criteria on #577 read them: a user cannot touch
// another user's objects, a non-admin cannot touch shared content, and the
// per-bucket MIME/size limits still bite.

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

const asUser = (bucketId: string, path: string) => ({ bucketId, path, userId: USER, isAdmin: false });
const asAdmin = (bucketId: string, path: string) => ({ bucketId, path, userId: USER, isAdmin: true });

describe("authorizePath — owner prefix", () => {
  it("allows a user under their own uuid", () => {
    expect(authorizePath(asUser("npc-portraits", `${USER}/a.webp`)).allowed).toBe(true);
  });

  it("allows nested paths under the owner prefix", () => {
    expect(authorizePath(asUser("mini-models", `${USER}/mini-7/model.stl`)).allowed).toBe(true);
  });

  it("refuses another user's prefix", () => {
    const result = authorizePath(asUser("npc-portraits", `${OTHER}/a.webp`));
    expect(result.allowed).toBe(false);
  });

  it("refuses another user's prefix even for an admin", () => {
    // Admin is not a master key: no code path writes under someone else's uuid,
    // so allowing it would only ever be an accident.
    expect(authorizePath(asAdmin("npc-portraits", `${OTHER}/a.webp`)).allowed).toBe(false);
  });

  it("refuses a prefix that merely starts with the user id", () => {
    // Segment equality, not startsWith — otherwise `<uuid>-evil/` would pass.
    expect(authorizePath(asUser("npc-portraits", `${USER}-evil/a.webp`)).allowed).toBe(false);
  });

  it("refuses when there is no authenticated user", () => {
    expect(authorizePath({ bucketId: "npc-portraits", path: "x/a.webp", userId: "", isAdmin: false }).allowed).toBe(false);
  });

  it("refuses an unknown bucket", () => {
    // bug-reports and downtime-images are deliberately outside the registry;
    // tile-packs has a bucket but no code. None of them may be written here.
    for (const id of ["bug-reports", "downtime-images", "tile-packs", ""]) {
      expect(authorizePath(asAdmin(id, `${USER}/a.webp`)).allowed).toBe(false);
    }
  });
});

describe("authorizePath — admin-only shared prefixes", () => {
  it("lets an admin write canonical srd/ art in the two buckets that have it", () => {
    expect(authorizePath(asAdmin("monster-images", "srd/owlbear.webp")).allowed).toBe(true);
    expect(authorizePath(asAdmin("spell-images", "srd/fireball.webp")).allowed).toBe(true);
  });

  it("refuses srd/ to a non-admin — acceptance criterion on #577", () => {
    expect(authorizePath(asUser("monster-images", "srd/owlbear.webp")).allowed).toBe(false);
    expect(authorizePath(asUser("spell-images", "srd/fireball.webp")).allowed).toBe(false);
  });

  it("does not grant srd/ in buckets that never had an srd policy", () => {
    // Only monster-images and spell-images have the migration; an admin writing
    // srd/ elsewhere would create art nothing reads and nothing can clean up.
    for (const id of ["item-images", "npc-portraits", "loot-images", "chronicle"]) {
      expect(authorizePath(asAdmin(id, "srd/x.webp")).allowed).toBe(false);
    }
  });

  it("guards the shared sound catalogue under sounds/library/", () => {
    expect(authorizePath(asAdmin("sounds", "library/rain.ogg")).allowed).toBe(true);
    // A DM deleting their own sound row must never reach a catalogue object.
    expect(authorizePath(asUser("sounds", "library/rain.ogg")).allowed).toBe(false);
  });

  it("guards the shared mini plinth meshes under mini-models/bases/", () => {
    expect(authorizePath(asAdmin("mini-models", "bases/round25.stl")).allowed).toBe(true);
    expect(authorizePath(asUser("mini-models", "bases/round25.stl")).allowed).toBe(false);
  });
});

describe("authorizePath — path shape", () => {
  const bad = [
    ["", "empty"],
    ["a.webp", "single segment"],
    [`/${USER}/a.webp`, "leading slash"],
    [`${USER}//a.webp`, "empty segment"],
    [`${USER}/../${OTHER}/a.webp`, "parent segment"],
    [`${USER}/./a.webp`, "current-dir segment"],
    [`${USER}\\a.webp`, "backslash"],
    [`${USER}/a\nb.webp`, "newline"],
    [`${USER}/a\u0000b.webp`, "NUL"],
    [`${USER}/a\u007fb.webp`, "DEL"],
  ] as const;

  for (const [path, label] of bad) {
    it(`refuses ${label}`, () => {
      expect(authorizePath(asUser("npc-portraits", path)).allowed).toBe(false);
    });
  }

  it("refuses a key past R2's 1024-byte limit", () => {
    expect(authorizePath(asUser("npc-portraits", `${USER}/${"a".repeat(1024)}.webp`)).allowed).toBe(false);
  });

  it("counts the limit in bytes, not code units", () => {
    // 400 four-byte emoji = 1600 bytes but only 800 UTF-16 code units.
    expect(authorizePath(asUser("npc-portraits", `${USER}/${"🐉".repeat(400)}.webp`)).allowed).toBe(false);
  });

  it("accepts ordinary unicode and spaces in a name", () => {
    expect(authorizePath(asUser("chronicle", `${USER}/séance 1.webp`)).allowed).toBe(true);
  });
});

describe("authorizeUpload — MIME and size", () => {
  const upload = (bucketId: string, contentType: string, size: number) =>
    authorizeUpload({ ...asUser(bucketId, `${USER}/a.bin`), contentType, size });

  it("accepts an allowed MIME under the cap", () => {
    expect(upload("npc-portraits", "image/webp", 1024).allowed).toBe(true);
  });

  it("refuses a MIME outside the bucket's allowlist", () => {
    // SVG was dropped from every image bucket on purpose (migration 20260413000004).
    expect(upload("npc-portraits", "image/svg+xml", 1024).allowed).toBe(false);
    expect(upload("npc-portraits", "image/png", 1024).allowed).toBe(false);
    expect(upload("sounds", "image/webp", 1024).allowed).toBe(false);
  });

  it("enforces each bucket's own cap", () => {
    expect(upload("npc-portraits", "image/webp", 5 * 1024 * 1024).allowed).toBe(true);
    expect(upload("npc-portraits", "image/webp", 5 * 1024 * 1024 + 1).allowed).toBe(false);
    expect(upload("sounds", "audio/mpeg", 20 * 1024 * 1024).allowed).toBe(true);
    expect(upload("sounds", "audio/mpeg", 20 * 1024 * 1024 + 1).allowed).toBe(false);
    expect(upload("mini-models", "model/stl", 50 * 1024 * 1024).allowed).toBe(true);
    expect(upload("mini-models", "model/stl", 50 * 1024 * 1024 + 1).allowed).toBe(false);
  });

  it("refuses a zero, negative, fractional or non-finite size", () => {
    // The declared size is pinned into the signed Content-Length; a nonsense
    // value must not reach the signer, where it would produce a signature no
    // real body can satisfy (or, worse, one that any body can).
    for (const size of [0, -1, 1.5, NaN, Infinity]) {
      expect(upload("npc-portraits", "image/webp", size).allowed).toBe(false);
    }
  });

  it("applies the prefix rules before MIME and size", () => {
    const result = authorizeUpload({
      ...asUser("monster-images", "srd/x.webp"),
      contentType: "image/webp",
      size: 10,
    });
    expect(result).toEqual({ allowed: false, reason: expect.stringContaining("admin-only") });
  });
});

describe("policy registry", () => {
  it("has a unique id per bucket", () => {
    const ids = STORAGE_WRITE_POLICY.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every bucket a non-empty MIME allowlist and a positive cap", () => {
    for (const p of STORAGE_WRITE_POLICY) {
      expect(p.mimeTypes.length).toBeGreaterThan(0);
      expect(p.maxBytes).toBeGreaterThan(0);
    }
  });

  it("never lists a uuid-shaped admin prefix", () => {
    // An admin prefix is always a literal folder name. A uuid here would hand
    // every admin a permanent key to one specific user's objects.
    for (const p of STORAGE_WRITE_POLICY) {
      for (const prefix of p.adminPrefixes) {
        expect(prefix).not.toMatch(/^[0-9a-f]{8}-/i);
      }
    }
  });

  it("resolves by id and returns null otherwise", () => {
    expect(bucketWritePolicy("sounds")?.maxBytes).toBe(20 * 1024 * 1024);
    expect(bucketWritePolicy("nope")).toBeNull();
  });
});
