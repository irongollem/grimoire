/**
 * The planning half of `scripts/storage-usage.ts` (#1182): given what R2 holds and what `stored_objects` says, decide
 * which rows to record and which to remove. Pure, so the guards are testable without R2 or a database.
 */
import { ownerOfPath } from "../../supabase/functions/_shared/storage-accounting.ts";

/** An object as the R2 listing reports it, with the bucket id already stripped from the key. */
export interface ListedObject {
  path: string;
  size: number;
}

/** A `stored_objects` row, as far as the plan needs it. */
export interface StoredRow {
  path: string;
  user_id: string;
  bytes: number;
  created_at: string;
  /** Set when the file was deleted while its upload URL still worked; such a row stops counting soon after. */
  released_at: string | null;
}

export interface RecordEntry {
  path: string;
  userId: string;
  size: number;
}

export interface StoragePlan {
  record: RecordEntry[];
  remove: string[];
  /** Objects the listing holds that belong to no account (srd/, library/, bases/ ...): never recorded. */
  unowned: number;
  /** Zero-byte objects: the table requires bytes > 0, so they are not recorded. */
  empty: number;
  /** Bytes the listing holds per account, over the objects that are owned and not empty. */
  bytesByUser: Map<string, number>;
}

export const DEFAULT_GRACE_MINUTES = 60;

/**
 * `now` is a parameter so the grace boundary is testable. A row is written when an upload is signed, and the bytes may
 * still be on their way, so a row absent from the listing is removed only once it is older than the grace period.
 */
export function planStorageUsage(
  listing: readonly ListedObject[],
  rows: readonly StoredRow[],
  now: Date,
  graceMinutes: number,
): StoragePlan {
  const rowsByPath = new Map(rows.map((r) => [r.path, r]));
  const listedPaths = new Set<string>();
  const record: RecordEntry[] = [];
  const bytesByUser = new Map<string, number>();
  let unowned = 0;
  let empty = 0;

  for (const object of listing) {
    const userId = ownerOfPath(object.path);
    if (userId === null) {
      unowned += 1;
      continue;
    }
    listedPaths.add(object.path);
    if (object.size <= 0) {
      empty += 1;
      continue;
    }
    bytesByUser.set(userId, (bytesByUser.get(userId) ?? 0) + object.size);
    const row = rowsByPath.get(object.path);
    // Re-record a changed size or a changed owner; an equal row is left alone so a re-run writes nothing.
    // A row marked released whose object is in the listing was uploaded after its delete: recording it
    // again clears the mark, or the total would forget a file that exists.
    if (!row || Number(row.bytes) !== object.size || row.user_id !== userId || row.released_at !== null) {
      record.push({ path: object.path, userId, size: object.size });
    }
  }

  const cutoff = now.getTime() - graceMinutes * 60_000;
  const remove = rows
    .filter((row) => !listedPaths.has(row.path) && new Date(row.created_at).getTime() < cutoff)
    .map((row) => row.path);

  return { record, remove, unowned, empty, bytesByUser };
}

/** Groups entries per account, in first-seen order, so each `reserve_storage` call is one (account, bucket). */
export function groupByUser(entries: readonly RecordEntry[]): Map<string, RecordEntry[]> {
  const groups = new Map<string, RecordEntry[]>();
  for (const entry of entries) {
    const group = groups.get(entry.userId);
    if (group) group.push(entry);
    else groups.set(entry.userId, [entry]);
  }
  return groups;
}

/** How many accounts sit over a ceiling given in bytes. */
export function countOver(bytesByUser: ReadonlyMap<string, number>, limitBytes: number): number {
  let count = 0;
  for (const bytes of bytesByUser.values()) if (bytes > limitBytes) count += 1;
  return count;
}

export const FREE_LIMIT_BYTES = 250 * 1024 * 1024;
export const PRO_LIMIT_BYTES = 10240 * 1024 * 1024;
