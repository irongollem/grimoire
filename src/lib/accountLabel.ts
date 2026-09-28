import { isChildLoginEmail } from "@edge-shared/childAccount.ts";

/**
 * What to call the *signed-in* account in the app's own chrome — the sidebar
 * account menu, the account settings page — as opposed to
 * `useAuthStore().publicName`, which is what *other people* see (#635).
 *
 * Prefers a display name or profile username, same order `publicName` uses.
 * When neither is set, the account's own email is a reasonable fallback —
 * except a parent-managed child account's own "email" is an internal
 * `@players.dungeongrimoire.invalid` marker address (#919), which must never
 * render anywhere a child could see it. That case falls back to the child's
 * login name instead — the thing they actually typed in to sign in.
 *
 * Checking the email string itself (`isChildLoginEmail`) rather than reading
 * `useAuthStore().isChildAccount` matters: the latter depends on
 * `child_accounts` finishing its own async load, so a component that reads it
 * can flash the internal address for however long that query takes. The email
 * suffix is known the instant the session itself is known, so this has
 * nothing to wait for.
 */
export interface AccountLabelInput {
  displayName?: string | null;
  username?: string | null;
  email?: string | null;
  childLoginName?: string | null;
}

/** True when `email` is a child account's internal marker address rather
 *  than a real one — never safe to show. */
export function isUnsafeAccountEmail(email: string | null | undefined): boolean {
  return !!email && isChildLoginEmail(email);
}

export function accountLabel({ displayName, username, email, childLoginName }: AccountLabelInput): string {
  const name = displayName?.trim() || username?.trim();
  if (name) return name;
  if (email && !isUnsafeAccountEmail(email)) return email;
  return childLoginName?.trim() || "";
}
