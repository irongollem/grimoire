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
  "child_user_id, parent_user_id, login_name, adult_on, consent_version, consented_at";

/** Mirrors `private.is_child_account`: a link counts until its adult_on. */
export function isActiveChildLink(link: Pick<ChildAccountLink, "adult_on">, today = new Date()): boolean {
  return link.adult_on > isoDate(today);
}
