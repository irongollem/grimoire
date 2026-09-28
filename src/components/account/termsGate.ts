import { TERMS_VERSION } from "@/lib/legal";

/**
 * Routes the gate's "I don't agree" state links to (Account settings,
 * Billing) — and everything nested under them, e.g. the parent-managed
 * account settings that will live under `/account/family`. The gate must get
 * out of its own way there, or the very links it offers as the way out stop
 * working: a blocking dialog re-appearing on top of `/account` traps the
 * person it was meant to let leave.
 */
const EXEMPT_PATH_PREFIXES = ["/account", "/billing"] as const;

export function isTermsGateExemptPath(path: string): boolean {
  return EXEMPT_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
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
