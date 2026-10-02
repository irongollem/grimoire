import { isoDate } from "@edge-shared/childAccount.ts";
import type { ChildAccountLink } from "@/types/childAccount.types";

/**
 * Pure `child_accounts` helpers, split out of `useChildAccount.ts` (#919) so
 * `src/stores/auth.ts` can read them without importing the composable itself
 * — that composable now reads the auth store, and a store importing its own
 * reader back would be a circular value import (two setup-store modules each
 * needing the other's runtime exports at load time, not just erased types).
 */

export const CHILD_ACCOUNT_COLUMNS =
  "child_user_id, parent_user_id, login_name, adult_on, consent_version, consented_at, created_at";

/** Mirrors `private.is_child_account`: a link counts until its adult_on. */
export function isActiveChildLink(link: Pick<ChildAccountLink, "adult_on">, today = new Date()): boolean {
  return link.adult_on > isoDate(today);
}

/** How many of a parent's young players inherit the parent's Pro limits (#928). */
export const INHERITING_CHILD_LIMIT = 5;

/**
 * The ids of the young players that inherit their parent's Pro limits: the
 * first five active links, ordered by `created_at` then `child_user_id`.
 * Mirrors `private.effective_quotas` for the Family page's display only; the
 * database decides the quota itself. The parent being Pro is the caller's
 * condition, not this function's.
 */
export function inheritingChildIds(
  links: Pick<ChildAccountLink, "child_user_id" | "adult_on" | "created_at">[],
  today = new Date(),
): Set<string> {
  const ordered = links
    .filter((l) => isActiveChildLink(l, today))
    .sort((a, b) => {
      // Timestamps compare as instants: the database orders timestamptz.
      const byCreated = Date.parse(a.created_at) - Date.parse(b.created_at);
      if (byCreated !== 0) return byCreated;
      return a.child_user_id < b.child_user_id ? -1 : a.child_user_id > b.child_user_id ? 1 : 0;
    });
  return new Set(ordered.slice(0, INHERITING_CHILD_LIMIT).map((l) => l.child_user_id));
}
