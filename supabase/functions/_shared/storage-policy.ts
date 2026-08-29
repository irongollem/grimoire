// Server-enforced storage write policy — the authorization that `storage.objects`
// RLS expresses today, restated as code for the buckets that move to R2 (#577
// stage 2).
//
// WHY THIS FILE EXISTS AT ALL:
// Supabase Storage enforces per-bucket MIME/size limits in `storage.buckets` and
// prefix ownership in `storage.objects` policies. R2 has neither — it is a plain
// object store with no notion of our users. So every rule that Postgres enforces
// today has to be re-expressed here, and this module becomes the *only* thing
// standing between an authenticated user and someone else's objects. Treat any
// change to it as a security change.
//
// It is deliberately pure: no Deno, no network, no Supabase client. That is what
// lets the browser client and the edge functions both import it, and what lets the
// whole rule set be unit-tested exhaustively under vitest.
//
// THE THREE PREFIX RULES, and where each comes from:
//
//   `{userId}/…`   every registry bucket, insert/update/delete
//                  (`(storage.foldername(name))[1] = auth.uid()::text`)
//   `srd/…`        monster-images + spell-images, app admins only
//                  (migrations 20260514000003 / 20260514000004)
//   `library/…`    sounds only, app admins only — the shared sound catalogue
//                  (migration 20260728000004)
//
// The `srd/` prefix is a storage-path convention that #583 deliberately did NOT
// rename alongside the `library_*` tables; see CLAUDE.md. `library/` in `sounds`
// is a different thing entirely — the shared sound catalogue — and the collision
// of vocabulary is unfortunate but load-bearing in both directions, so neither is
// renamed here.
//
// MIME/size limits are mirrored from `BUCKETS` in src/lib/storage/buckets.ts,
// and a test in src/lib/storage/buckets.test.ts fails if the two drift.
//
// `BUCKETS` does NOT mirror the SQL, despite what this comment used to claim.
// Ten of the fifteen buckets were created by hand with no migration, and
// production has drifted from the registry for two of them. Since #577 sends
// writes to R2, the limits enforced on the live path are the ones in this file
// — so the registry is the source of truth and the Supabase bucket config now
// binds only the fallback. Do not "restore consistency" by copying production's
// looser values into the registry; that would loosen R2 enforcement, which is
// the only thing standing between a user and someone else's objects.

export interface BucketWritePolicy {
  readonly id: string;
  /** Server-enforced cap, in bytes. */
  readonly maxBytes: number;
  /** Server-enforced MIME allowlist. */
  readonly mimeTypes: readonly string[];
  /**
   * Literal first path segments an **app admin** may write to, in addition to
   * their own user id. Empty for every bucket that has no shared content.
   */
  readonly adminPrefixes: readonly string[];
  /**
   * False when clients may never write this bucket at all — every byte goes
   * through the service-role pipeline. The original RLS expressed this by
   * simply *having no* insert/update/delete policies for the bucket; in code
   * that absence has to be an explicit flag, or the generic `{userId}/` owner
   * rule quietly grants what RLS deliberately withheld.
   */
  readonly clientWrites: boolean;
}

const FIVE_MB = 5 * 1024 * 1024;
const TWENTY_MB = 20 * 1024 * 1024;
const FIFTY_MB = 50 * 1024 * 1024;

const IMAGE_MIMES = ["image/webp", "image/jpeg"] as const;

const MINI_MODEL_MIMES = [
  "model/gltf-binary",
  "model/stl",
  "application/octet-stream",
  "image/webp",
] as const;

const AUDIO_MIMES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/webm",
  "audio/aac",
  "audio/flac",
] as const;

const image = (id: string, adminPrefixes: readonly string[] = []): BucketWritePolicy => ({
  id,
  maxBytes: FIVE_MB,
  mimeTypes: IMAGE_MIMES,
  adminPrefixes,
  clientWrites: true,
});

export const STORAGE_WRITE_POLICY: readonly BucketWritePolicy[] = [
  image("npc-portraits"),
  image("asset-images"),
  image("spell-images", ["srd"]),
  image("puzzle-images"),
  image("item-images"),
  image("monster-images", ["srd"]),
  image("trap-images"),
  image("location-images"),
  image("faction-images"),
  image("pantheon-emblems"),
  image("loot-images"),
  image("sound-images"),
  image("chronicle"),
  {
    id: "sounds",
    maxBytes: TWENTY_MB,
    mimeTypes: AUDIO_MIMES,
    clientWrites: true,
    // The shared sound catalogue. Objects under `library/` are single-instance and
    // referenced by many DMs' `sounds` rows (with `storage_path: null`), so one
    // DM's delete must never reach them — the same invariant `srd/` gives art.
    adminPrefixes: ["library"],
  },
  {
    id: "mini-models",
    maxBytes: FIFTY_MB,
    mimeTypes: MINI_MODEL_MIMES,
    // `bases/` holds the shared plinth meshes every mini composes against —
    // admin-seeded via scripts/ingest-mini-bases.ts, never user-written.
    adminPrefixes: ["bases"],
    // Service-role only, matching the original RLS exactly: migration
    // 20260718000001 creates SELECT-only policies for this bucket, on purpose —
    // "we do not host user-uploaded 3D files" (SIMULACRUM_PLAN.md §3). Every
    // write goes through forge-mini / poll-meshy-jobs, which is what enforces
    // the mini_sculpt credit charge and provenance marking. Granting the
    // generic {userId}/ rule here would let any authenticated user presign
    // 50 MB PUTs and use the bucket as free file hosting.
    clientWrites: false,
  },
];

const BY_ID = new Map(STORAGE_WRITE_POLICY.map((p) => [p.id, p]));

export function bucketWritePolicy(bucketId: string): BucketWritePolicy | null {
  return BY_ID.get(bucketId) ?? null;
}

export type AuthzResult = { allowed: true } | { allowed: false; reason: string };

const DENY = (reason: string): AuthzResult => ({ allowed: false, reason });
const ALLOW: AuthzResult = { allowed: true };

/** R2 caps object keys at 1024 bytes; refuse before the store does. */
const MAX_KEY_BYTES = 1024;

export interface PathAuthzInput {
  readonly bucketId: string;
  readonly path: string;
  /** `auth.uid()` of the caller, as re-derived server-side — never client-supplied. */
  readonly userId: string;
  /** True when the caller's JWT carries `app_metadata.role === "admin"`. */
  readonly isAdmin: boolean;
}

/**
 * Reject any path that is not a plain `<segment>/<segment>[/…]` key.
 *
 * R2 keys are opaque strings, so `..` does not traverse anything at the store.
 * The danger is upstream of that: every rule below keys off *the first segment*,
 * so a path whose segmentation is ambiguous (`u1//../srd/x`, a backslash that
 * some consumer later treats as a separator, a leading slash that shifts every
 * index) turns a prefix check into a guess. Refusing the ambiguity outright is
 * cheaper than reasoning about which consumer normalises what.
 */
function invalidPathReason(path: string): string | null {
  if (!path) return "path is empty";
  if (new TextEncoder().encode(path).length > MAX_KEY_BYTES) {
    return `path exceeds ${MAX_KEY_BYTES} bytes`;
  }
  if (path.startsWith("/")) return "path must not start with /";
  if (path.includes("\\")) return "path must not contain a backslash";
  // Control characters are rejected rather than escaped: they have no place in a
  // UUID-based key, and they are exactly what smuggles a newline into a signed
  // header or a canonical request downstream.
  for (const ch of path) {
    const code = ch.codePointAt(0)!;
    if (code < 0x20 || code === 0x7f) return "path must not contain control characters";
  }

  const segments = path.split("/");
  if (segments.length < 2) return "path must be <prefix>/<name>";
  for (const segment of segments) {
    if (!segment) return "path must not contain an empty segment";
    if (segment === "." || segment === "..") return "path must not contain . or .. segments";
  }
  return null;
}

/**
 * Decide whether `userId` may write to (or delete) `path` in `bucketId`.
 *
 * This is the port of the `storage.objects` policies. Mirror of:
 *   using / with check (bucket_id = '<id>' and (storage.foldername(name))[1] = auth.uid()::text)
 * plus the admin-only literal prefixes above.
 *
 * `isAdmin` must come from the caller's verified JWT (`app_metadata.role`, which
 * is server-controlled), never from the request body — the whole point of
 * `is_app_admin()` being a SECURITY DEFINER function is that the client cannot
 * assert it about itself.
 */
export function authorizePath({ bucketId, path, userId, isAdmin }: PathAuthzInput): AuthzResult {
  const policy = bucketWritePolicy(bucketId);
  if (!policy) return DENY(`unknown bucket "${bucketId}"`);

  // Before any prefix logic: a service-only bucket has no client-writable
  // path at all, whoever the caller is. Admin is not an exception — the admin
  // paths that do exist (`bases/` seeding) run with service credentials via
  // scripts, never through the client-facing edge functions that call this.
  if (!policy.clientWrites) {
    return DENY(`${policy.id} is service-managed — clients cannot write it`);
  }

  const invalid = invalidPathReason(path);
  if (invalid) return DENY(invalid);

  if (!userId) return DENY("no authenticated user");

  const prefix = path.slice(0, path.indexOf("/"));
  if (prefix === userId) return ALLOW;

  if (policy.adminPrefixes.includes(prefix)) {
    return isAdmin ? ALLOW : DENY(`"${prefix}/" in ${bucketId} is admin-only`);
  }

  // Explicitly *not* "admins may write anywhere": an admin writing under another
  // user's uuid is the same mistake as a user doing it, and no code path needs it.
  return DENY(`path must start with "${userId}/"`);
}

export interface UploadAuthzInput extends PathAuthzInput {
  readonly contentType: string;
  /** Byte length the caller declares. Pinned into the signature by the caller. */
  readonly size: number;
}

/**
 * `authorizePath` plus the per-bucket MIME and size limits that `storage.buckets`
 * enforces for Supabase-hosted objects.
 *
 * `size` is declared by the client, which on its own would make it worthless as a
 * limit. It is not the enforcement — it is the value the presigner pins into the
 * signed `Content-Length`, so a body of any other length fails R2's signature
 * check. Validating it here is what makes that pin meaningful.
 */
export function authorizeUpload(input: UploadAuthzInput): AuthzResult {
  const pathResult = authorizePath(input);
  if (!pathResult.allowed) return pathResult;

  // Non-null: authorizePath already rejected an unknown bucket.
  const policy = bucketWritePolicy(input.bucketId)!;

  if (!policy.mimeTypes.includes(input.contentType)) {
    return DENY(`${input.contentType} is not allowed in ${policy.id}`);
  }
  if (!Number.isInteger(input.size) || input.size <= 0) {
    return DENY("size must be a positive integer");
  }
  if (input.size > policy.maxBytes) {
    return DENY(
      `${(input.size / 1024 / 1024).toFixed(1)} MB exceeds the ${(policy.maxBytes / 1024 / 1024).toFixed(0)} MB limit for ${policy.id}`,
    );
  }
  return ALLOW;
}
