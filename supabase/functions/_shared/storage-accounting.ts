import { UUID_RE as UUID } from "./uuid.ts";
/**
 * Storage accounting (#1182): every upload's size is recorded against the account
 * that owns it, and a per-account ceiling is enforced quietly at sign time.
 *
 * The database does the arithmetic (`reserve_storage` / `release_storage`, service
 * role only); this module is the thin edge-function side. Ownership is read from
 * the key: every client-writable path starts with the owner's user id, and the
 * shared prefixes (`srd`, `library`, `bases`) belong to nobody.
 *
 * Everything here FAILS OPEN. The ceiling is a backstop against runaway storage,
 * not a gate that may take uploads down: if the accounting call errors or answers
 * something unrecognised, the upload goes ahead and the failure is logged.
 */

export const STORAGE_FULL_CODE = "storage_full";

/** The slice of a service-role Supabase client this module needs. */
export interface RpcClient {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export interface StoredObject {
  path: string;
  size: number;
}

export type Reservation = { allowed: true } | { allowed: false; used: number; limit: number };


/** The account a key belongs to: its first segment when that is a user id and a file follows. */
export function ownerOfPath(path: string): string | null {
  const [first, second] = path.split("/");
  if (!first || !second) return null;
  return UUID.test(first) ? first : null;
}

/**
 * What a sign request reserves: only the caller's own keys, and whether the
 * ceiling applies to them. An app admin is neither counted nor held to the
 * ceiling (maintainer, 15 Nov 2026), so nothing of theirs is reserved. A
 * shared srd/ or library/ key belongs to no account and is never counted.
 */
export function signReservation(
  objects: readonly StoredObject[],
  caller: { readonly userId: string; readonly isAdmin: boolean },
): { objects: StoredObject[]; enforce: boolean } {
  return {
    objects: caller.isAdmin
      ? []
      : objects
          .filter((object) => ownerOfPath(object.path) === caller.userId)
          .map((object) => ({ path: object.path, size: object.size })),
    enforce: !caller.isAdmin,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function reserveStoredObjects(
  admin: RpcClient,
  userId: string,
  bucket: string,
  objects: StoredObject[],
  enforce: boolean,
): Promise<Reservation> {
  if (objects.length === 0) return { allowed: true };
  try {
    const { data, error } = await admin.rpc("reserve_storage", {
      p_user_id: userId,
      p_bucket: bucket,
      p_objects: objects,
      p_enforce: enforce,
    });
    if (error) {
      console.error(`reserve_storage failed, allowing the upload: ${error.message}`);
      return { allowed: true };
    }
    if (isRecord(data)) {
      if (data.allowed === true) return { allowed: true };
      if (data.allowed === false && typeof data.used === "number" && typeof data.limit === "number") {
        return { allowed: false, used: data.used, limit: data.limit };
      }
    }
    console.error("reserve_storage answered an unrecognised shape, allowing the upload");
    return { allowed: true };
  } catch (err) {
    console.error(`reserve_storage threw, allowing the upload: ${err instanceof Error ? err.message : String(err)}`);
    return { allowed: true };
  }
}

/** Record a server-side write. Never enforces and never throws: the bytes are already stored. */
export async function recordStoredObject(
  admin: RpcClient,
  bucket: string,
  path: string,
  size: number,
): Promise<void> {
  const owner = ownerOfPath(path);
  if (!owner) return;
  await reserveStoredObjects(admin, owner, bucket, [{ path, size }], false);
}

export async function releaseStoredObjects(admin: RpcClient, bucket: string, paths: readonly string[]): Promise<void> {
  if (paths.length === 0) return;
  try {
    const { error } = await admin.rpc("release_storage", { p_bucket: bucket, p_paths: paths });
    if (error) console.error(`release_storage failed: ${error.message}`);
  } catch (err) {
    console.error(`release_storage threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}
