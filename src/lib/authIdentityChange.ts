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

/**
 * Tracks the last identity seen, so repeats of the same one are not changes.
 *
 * `event` is auth-js's event name. The one case it matters: the page's first
 * `INITIAL_SESSION` is not a change even though it is a first sighting. A cold
 * load has nothing cached that could belong to anyone else, because nothing
 * can query before it arrives: auth-js emits it while `getSession()` is still
 * resolving, every router navigation awaits `auth.initialize()` (which awaits
 * that same `getSession()`) before it or any component reads anything, and the
 * app mounts only after the first navigation. The only entries in the cache at
 * that moment are the static library lists restored from disk, which are not
 * identity-scoped. Resetting there cancelled the boot's own in-flight reads
 * and sent each of them twice. A first sighting under any other event
 * (`SIGNED_IN`, say) still counts as a change, as does every later switch.
 */
export function createIdentityChangeGate(): (
  userId: string | null,
  event?: string,
) => boolean {
  // `undefined` = nothing seen yet, which is different from "signed out"
  // (`null`): the first event of a session must be able to count as a change.
  let seen: string | null | undefined = undefined;

  return (userId: string | null, event?: string): boolean => {
    const firstSighting = seen === undefined;
    const changed = seen !== userId;
    seen = userId;
    if (firstSighting && event === "INITIAL_SESSION") return false;
    // Signing OUT is not a reason to refetch: the router sends the user to
    // /login, and the cache is about to belong to nobody. Signing IN, or
    // switching accounts, is. A first sighting is a change by construction,
    // since `seen` starts as `undefined`.
    return changed && userId !== null;
  };
}
