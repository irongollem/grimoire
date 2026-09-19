/**
 * "Did the signed-in identity actually change?" — the question behind throwing
 * the query cache away.
 *
 * Every campaign-scoped query is keyed on the campaign id alone
 * (`["party", campaignId]` and friends), and `campaignStore.activeCampaignId`
 * is read from localStorage and survives a sign-out. So the key a signed-in DM
 * reads is byte-identical to the key that was in play before they signed in —
 * and a read that went out while the app did not yet believe it was signed in
 * is answered `200 []` by RLS, legitimately, with no token. That empty success
 * is cached (`staleTime: 60_000`) and then served to the signed-in app: a
 * dashboard with no players, no error, and no reason to re-ask. Reported in
 * production on 19 Sep 2026: "navigating somewhere and back solves this, but
 * it's a race condition on first load that doesn't auto-resolve itself" — the
 * navigation did not fix it, the 60 seconds did.
 *
 * `authAwareFetch` cannot catch this one: it refuses an anon read only when the
 * app *believes* it is signed in, and here the app correctly believed it was
 * not. The answer was right when it was cached and wrong a moment later.
 *
 * Hence: on a real identity change, drop everything. Not on every `SIGNED_IN`
 * event — auth-js re-emits that for the same session (tab focus, a restored
 * session), and invalidating the whole cache each time would refetch the app
 * for nothing.
 */

/** Tracks the last identity seen, so repeats of the same one are not changes. */
export function createIdentityChangeGate(): (userId: string | null) => boolean {
  // `undefined` = nothing seen yet, which is different from "signed out"
  // (`null`): the first event of a session must be able to count as a change.
  let seen: string | null | undefined = undefined;

  return (userId: string | null): boolean => {
    const changed = seen !== userId;
    seen = userId;
    // Signing OUT is not a reason to refetch: the router sends the user to
    // /login, and the cache is about to belong to nobody. Signing IN, or
    // switching accounts, is. A first sighting is a change by construction,
    // since `seen` starts as `undefined`.
    return changed && userId !== null;
  };
}
