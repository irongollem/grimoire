/**
 * The "I'm active" stamp behind the 12-month retention rule. `last_sign_in_at`
 * only moves on a fresh sign-in, which a long-lived refresh token never makes,
 * so `main.ts` calls this from the auth listener and the server keeps the real
 * `last_active_at`. Throttled here to once an hour per user per tab (the server
 * also no-ops within the hour), fire-and-forget: a failed stamp is reported but
 * never thrown into the auth callback.
 */
import { supabase } from "../supabase";
import { reportHandledError } from "../observability/sentry";

const THROTTLE_MS = 60 * 60 * 1000;

const lastTouched = new Map<string, number>();

export function touchAccountActivity(userId: string, now: number = Date.now()): void {
  const previous = lastTouched.get(userId);
  if (previous !== undefined && now - previous < THROTTLE_MS) return;
  lastTouched.set(userId, now);
  void Promise.resolve(supabase.rpc("touch_account_activity"))
    .then(({ error }) => {
      if (!error) return;
      // Let the next auth event retry rather than waiting out the hour.
      lastTouched.delete(userId);
      reportHandledError(error, "accountActivity:touch");
    })
    .catch((error: unknown) => {
      lastTouched.delete(userId);
      reportHandledError(error, "accountActivity:touch");
    });
}

/** Test seam: forget what this tab has already stamped. */
export function resetAccountActivityThrottle(): void {
  lastTouched.clear();
}
