/**
 * The admin focal-point queue (#965): one entry per distinct library picture.
 *
 * A picture is the unit of review because one image is shared by several rows
 * (a creature's 2014 / 2024 / A5E / Black Flag copies, every item name that
 * shares art), and the focal point decides the crop of all of them at once.
 * Pure on purpose: the composable only fetches rows and hands them here.
 */

export type FocalKind = "monster" | "spell" | "item";
export type FocalStatus = "unchecked" | "all";

export interface FocalPointValue {
  x: number;
  y: number;
}

/** A canonical art row (monster/spell) or a library_art_defaults row (item). */
export interface QueueArtRow {
  /** entry_id for monsters and spells, content_name for items. */
  key: string;
  imageUrl: string | null;
  focalPoint: FocalPointValue | null;
  /** NULL until a person has looked at the picture. */
  checkedAt: string | null;
}

/** A library row that shows a picture, for its display name. */
export interface QueueLibraryRow {
  name: string;
  imageUrl: string | null;
  focalPoint: FocalPointValue | null;
}

export interface FocalQueueEntry {
  kind: FocalKind;
  imageUrl: string;
  focalPoint: FocalPointValue | null;
  /** Null when any art row of the picture is still unchecked. */
  checkedAt: string | null;
  names: string[];
  keys: string[];
}

export function isChecked(entry: FocalQueueEntry): boolean {
  return entry.checkedAt !== null;
}

/** What an entry is called in a list: its first name, or its key when no library row shows it. */
export function entryLabel(entry: FocalQueueEntry): string {
  const [name] = entry.names;
  if (name !== undefined) return name;
  const [key] = entry.keys;
  return key === undefined ? entry.imageUrl : key;
}

function byLabel(a: string, b: string): number {
  return a.localeCompare(b, "en", { sensitivity: "base" });
}

interface Bucket {
  art: QueueArtRow[];
  names: Set<string>;
  libraryPoint: FocalPointValue | null;
}

/**
 * Groups rows by picture. Only pictures with at least one art row are queued: a
 * library row with no art row of its own shows a namesake's picture, which is
 * already in the queue through that namesake. Unchecked first, then by name.
 */
export function buildFocalQueue(
  kind: FocalKind,
  artRows: readonly QueueArtRow[],
  libraryRows: readonly QueueLibraryRow[],
): FocalQueueEntry[] {
  const buckets = new Map<string, Bucket>();
  const bucketFor = (url: string): Bucket => {
    const existing = buckets.get(url);
    if (existing) return existing;
    const created: Bucket = { art: [], names: new Set(), libraryPoint: null };
    buckets.set(url, created);
    return created;
  };

  for (const row of artRows) {
    if (row.imageUrl) bucketFor(row.imageUrl).art.push(row);
  }
  for (const row of libraryRows) {
    if (!row.imageUrl) continue;
    const bucket = buckets.get(row.imageUrl);
    if (!bucket) continue;
    if (row.name) bucket.names.add(row.name);
    if (!bucket.libraryPoint && row.focalPoint) bucket.libraryPoint = row.focalPoint;
  }

  const entries: FocalQueueEntry[] = [];
  for (const [imageUrl, bucket] of buckets) {
    const keys = bucket.art.map((row) => row.key).sort(byLabel);
    // Canonical rows are what the app reads first; the library row is the fallback.
    const canonicalPoint = bucket.art.find((row) => row.focalPoint)?.focalPoint ?? null;
    const unchecked = bucket.art.some((row) => row.checkedAt === null);
    const stamps = bucket.art.flatMap((row) => (row.checkedAt === null ? [] : [row.checkedAt])).sort();
    entries.push({
      kind,
      imageUrl,
      focalPoint: canonicalPoint ?? bucket.libraryPoint,
      checkedAt: unchecked ? null : (stamps[0] ?? null),
      names: [...bucket.names].sort(byLabel),
      keys,
    });
  }
  return sortFocalQueue(entries);
}

export function sortFocalQueue(entries: readonly FocalQueueEntry[]): FocalQueueEntry[] {
  return [...entries].sort((a, b) => {
    const checkedDiff = Number(isChecked(a)) - Number(isChecked(b));
    return checkedDiff !== 0 ? checkedDiff : byLabel(entryLabel(a), entryLabel(b));
  });
}

export function filterByStatus(entries: readonly FocalQueueEntry[], status: FocalStatus): FocalQueueEntry[] {
  return status === "all" ? [...entries] : entries.filter((entry) => !isChecked(entry));
}

/** Index of the first entry after `from` that the status filter keeps, or -1. */
export function nextMatchingIndex(entries: readonly FocalQueueEntry[], from: number, status: FocalStatus): number {
  for (let i = from + 1; i < entries.length; i++) {
    const entry = entries[i];
    if (entry && (status === "all" || !isChecked(entry))) return i;
  }
  return -1;
}
