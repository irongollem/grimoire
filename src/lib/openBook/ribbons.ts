/**
 * A visitor's ribbons (#1085): up to three bookmarks, kept in this browser only, per book.
 *
 * Every storage access is wrapped: a private window, blocked site data or a full quota must leave the book
 * readable with ribbons that simply do not persist. Nothing about a visitor leaves the device.
 */

import { safeLocalStorage } from "@/lib/safeLocalStorage";

export const MAX_RIBBONS = 3;

export interface Ribbon {
  /** A section key from `sections.ts`: `entry:<id>`, `almanac`, `index` or `contents`. */
  key: string;
  /** The spread within that section. */
  unit: number;
  /** What the ribbon is called in the list. */
  title: string;
}

type ReadableStorage = Pick<Storage, "getItem">;
type WritableStorage = Pick<Storage, "setItem">;

export function ribbonStorageKey(slug: string): string {
  return `open-book:ribbons:${slug}`;
}

function isRibbon(value: unknown): value is Ribbon {
  if (typeof value !== "object" || value === null) return false;
  const rec = value as Record<string, unknown>;
  return (
    typeof rec.key === "string" &&
    rec.key.length > 0 &&
    typeof rec.title === "string" &&
    typeof rec.unit === "number" &&
    Number.isInteger(rec.unit) &&
    rec.unit >= 0
  );
}

/** The stored ribbons, or none when storage is absent, throws or holds something else. */
export function readRibbons(slug: string, storage: ReadableStorage | null = safeStorage()): Ribbon[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(ribbonStorageKey(slug));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRibbon).slice(0, MAX_RIBBONS);
  } catch {
    return [];
  }
}

/** Returns whether the write took, so a caller can tell a ribbon that will not survive a reload. */
export function writeRibbons(
  slug: string,
  ribbons: readonly Ribbon[],
  storage: WritableStorage | null = safeStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(ribbonStorageKey(slug), JSON.stringify(ribbons));
    return true;
  } catch {
    return false;
  }
}

export function isMarked(ribbons: readonly Ribbon[], key: string, unit: number): boolean {
  return ribbons.some((r) => r.key === key && r.unit === unit);
}

/** Marks the spread, or lifts the ribbon if it is already there. A fourth ribbon replaces the oldest. */
export function toggleRibbon(ribbons: readonly Ribbon[], ribbon: Ribbon): Ribbon[] {
  if (isMarked(ribbons, ribbon.key, ribbon.unit)) {
    return ribbons.filter((r) => !(r.key === ribbon.key && r.unit === ribbon.unit));
  }
  return [...ribbons, ribbon].slice(-MAX_RIBBONS);
}

/** Drops ribbons whose page is not in this release (the DM took it out, or the slug now holds another book). */
export function keepKnown(ribbons: readonly Ribbon[], knownKeys: ReadonlySet<string>): Ribbon[] {
  return ribbons.filter((r) => knownKeys.has(r.key));
}

function safeStorage(): Storage {
  return safeLocalStorage();
}
