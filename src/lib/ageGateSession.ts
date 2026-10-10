/**
 * Session memory for the age question every account-creating form asks
 * (#919), plus the Terms gate's re-ask of the same question for a grandfathered
 * account that never answered it.
 *
 * Once someone says "under 16" the form swaps to `ParentRequestForm` and stays
 * there: reloading or going back must not reopen the age question, which is
 * exactly what would let it simply be re-answered until it gives the wanted
 * result — standard practice for an age gate, not paranoia specific to this
 * one. A plain `sessionStorage` flag is enough: it does not need to survive a
 * new tab or a new day, only a reload or a back navigation within the same
 * attempt.
 *
 * Wrapped in try/catch throughout: private browsing or a blocked storage API
 * must degrade to "the age question can reappear," never to a crash.
 */
import { safeSessionStorage } from "@/lib/safeLocalStorage";

const KEY = "grimoire:age-gate";

/** Record that this browser session answered "under 16" to the age question. */
export function rememberUnder16(): void {
  try {
    safeSessionStorage().setItem(KEY, "under16");
  } catch {
    // Storage unavailable — the age question simply reappears on reload.
  }
}

/** Whether this browser session already answered "under 16." */
export function wasAnsweredUnder16(): boolean {
  try {
    return safeSessionStorage().getItem(KEY) === "under16";
  } catch {
    return false;
  }
}

/** Forgets the answer — only meaningful for tests; nothing in the app clears it mid-session. */
export function clearAgeGateChoice(): void {
  try {
    safeSessionStorage().removeItem(KEY);
  } catch {
    // See above.
  }
}
