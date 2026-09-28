import { TERMS_VERSION } from "@/lib/legal";

/**
 * The routes the gate's "I don't agree" state links to: Account settings and
 * Billing. The gate must get out of its own way there, or the very links it
 * offers as the way out stop working: a blocking dialog re-appearing on top
 * of `/account` traps the person it was meant to let leave.
 *
 * `/account` exactly, not its children. The Family pages under it must show
 * the gate: adding a young player requires having accepted the current Terms
 * (child-account refuses otherwise), so a parent arriving from a request
 * email answers the gate first and then carries on with the form.
 */
export function isTermsGateExemptPath(path: string): boolean {
  return path === "/account" || path === "/billing" || path.startsWith("/billing/");
}

export interface TermsGateState {
  isAuthenticated: boolean;
  /** `useSubscription()`'s `isLoading` — the row this gate keys off hasn't loaded yet. */
  subscriptionLoading: boolean;
  /** `useChildAccount()`'s `isLoading` — whether this account is an active child hasn't loaded yet. */
  childLoading: boolean;
  /** `useChildAccount()`'s `isChild` — an active child account never sees this gate. */
  isActiveChild: boolean;
  /** `subscription.terms_version`, or null/undefined for a row that predates the column. */
  termsVersion: string | null | undefined;
  /** The route's current path, e.g. `route.path`. */
  currentPath: string;
}

/**
 * Whether the blocking Terms dialog belongs on screen right now. Pure so the
 * loading-race and route-exemption conditions are testable without mounting
 * the component, Pinia or TanStack Query.
 *
 * A brand-new signup already carries the current `TERMS_VERSION` from the
 * moment its row is created (`useAuthStore.signUp`), so it never has a version
 * mismatch to show this for — the gate only ever fires for an account that
 * predates the version it's being compared against.
 */
export function shouldShowTermsGate(state: TermsGateState): boolean {
  if (!state.isAuthenticated) return false;
  if (state.subscriptionLoading || state.childLoading) return false;
  if (state.isActiveChild) return false;
  if (isTermsGateExemptPath(state.currentPath)) return false;
  return state.termsVersion !== TERMS_VERSION;
}
