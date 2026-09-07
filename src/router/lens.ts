import { ref } from "vue";
import type { QueryClient } from "@tanstack/vue-query";
import type { RouteLocationNormalized } from "vue-router";
import type { CampaignRole } from "@/types/campaign.types";
import { useAuthStore } from "@/stores/auth";
import {
  MY_MEMBERSHIPS_KEY,
  fetchMyMemberships,
} from "@/composables/campaign/useCampaignMembers";

/**
 * The lens fence (#847).
 *
 * #729 made routing follow the persisted DM/Player *lens* rather than the
 * active campaign's membership role, and that half is right: which hat you
 * wear is chosen, not inherited from whichever campaign happened to load. The
 * missing half was that once a hat is chosen, the active campaign must be one
 * where that role actually holds. Nothing checked the pair, so the DM shell
 * could sit on a campaign the account only plays in.
 *
 * This is defence in depth, not the boundary. RLS is the boundary, and it
 * holds: measured as a player of a campaign, `private.is_campaign_dm()`
 * answers false, every DM read returns zero rows, self-promotion is refused by
 * `guard_campaign_member_self_update` and `start_campaign_session` raises
 * (`supabase/tests/player_is_not_a_dm.test.sql`). But every one of those zeroes
 * is RLS doing the work alone, and this repo has shipped all three shapes that
 * take it away — a `SECURITY DEFINER` RPC that forgot its guard
 * (`grab_item_drop`), a view that lost `security_invoker`
 * (`ai_generation_costs`), a NULL predicate that never fired
 * (`get_user_ledger`). A client-side check costs one cached query and does not
 * pretend to be the boundary.
 */

/**
 * Which lens a route's campaign belongs to — `null` for the routes that hold
 * no campaign at all.
 *
 * Derived rather than opted into per route, and that is the point. A
 * `meta.requiresCampaignLens` flag on ~110 DM routes fails open for the 111th:
 * the route someone adds next year without it is unfenced and nothing says so.
 * Derivation has the opposite default, so `lens.test.ts` can pin the *whole*
 * set of unfenced routes and a new one has to be argued for there.
 *
 * Mirrors the branch the guard has always used to keep the two shells apart —
 * `/play` is the player area, everything else authenticated is DM. The four
 * exclusions are routes with no campaign to contradict: the auth shell (login,
 * signup, invite join, `/welcome`, OAuth consent, the Spotify callback), the
 * unauthenticated dev harnesses and the 404, and `/admin`, which is
 * account-scoped and carries its own fence.
 */
export function routeLens(
  to: Pick<RouteLocationNormalized, "path" | "meta">,
): CampaignRole | null {
  if (to.meta.layout === "auth") return null;
  if (!to.meta.requiresAuth) return null;
  if (to.meta.requiresAdmin) return null;
  return isPlayerArea(to.path) ? "player" : "dm";
}

/** The `/play` area, by path. */
export function isPlayerArea(path: string): boolean {
  return path === "/play" || path.startsWith("/play/");
}

/**
 * What this account's role in a campaign resolved to. Three answers, and the
 * third is the one that decides the design:
 *
 * - `"dm" | "player"` — known.
 * - `null` — known, and there is no membership row at all.
 * - `undefined` — *unresolved*: the lookup failed, or has not been made.
 *
 * `undefined` is never grounds to act. That is a deliberate difference from
 * `switchUserMode`, which fails closed on the same unknown (#845), and the
 * asymmetry that settled it there points the other way here. On the mode
 * toggle, refusing an unverifiable campaign costs one click to re-pick, on an
 * explicit user action. On every navigation it would cost a DM their live
 * campaign for one failed request, mid-session, at the table. RLS is the
 * boundary in both cases; a defence in depth that shuts the app down when the
 * network hiccups is a worse bug than the one it guards against.
 */
export type ResolvedRole = CampaignRole | null | undefined;

/**
 * The rule, in one place: a lens may only hold a campaign in which the account
 * holds that same role.
 */
export function lensContradicts(lens: CampaignRole, role: ResolvedRole): boolean {
  return role !== undefined && role !== lens;
}

/**
 * The role already in hand, with no request.
 *
 * `auth.initialize()` loads the membership row for exactly the campaign id in
 * localStorage, so on a cold boot the answer for the active campaign is
 * already loaded and the fence costs nothing on the path to first paint. It
 * answers "don't know" whenever the loaded row is for some *other* campaign —
 * the window after a campaign switch while `refreshMembership` is in flight.
 */
export function knownRoleInCampaign(campaignId: string): ResolvedRole {
  const membership = useAuthStore().membership;
  return membership?.campaign_id === campaignId ? membership.role : undefined;
}

/**
 * The role, asked for when it is not already known.
 *
 * One `campaign_members` select, shared with `useModeSwitch` through the query
 * cache under the same key, so the usual answer is a cache hit rather than a
 * round trip on the navigation path.
 *
 * `fresh` skips both caches — the loaded membership and the query — and is for
 * the one call that matters: the confirmation before closing someone's
 * campaign. A cached role is fine for "carry on"; it is not evidence enough to
 * act on. Once co-DM ships (#590) the account whose cached role still says
 * `player` is exactly the one just promoted, and evicting them from the
 * campaign they were promoted into would be this fence causing the bug it
 * exists to prevent.
 */
export async function resolveRoleInCampaign(
  queryClient: QueryClient,
  campaignId: string,
  { fresh = false }: { fresh?: boolean } = {},
): Promise<ResolvedRole> {
  if (!fresh) {
    const known = knownRoleInCampaign(campaignId);
    if (known !== undefined) return known;
  }
  const memberships = await queryClient
    .fetchQuery({
      queryKey: MY_MEMBERSHIPS_KEY,
      queryFn: fetchMyMemberships,
      ...(fresh ? { staleTime: 0 } : {}),
    })
    .catch(() => null);
  if (!memberships) return undefined;
  return memberships.find((m) => m.campaign_id === campaignId)?.role ?? null;
}

/**
 * Why the fence closed the last campaign, for the destination to explain.
 *
 * A bounce with no explanation is the bug #845 fixed, not a fix: the DM shell
 * is the DM shell, so landing in it with the campaign gone reads as data
 * having been taken away. `CampaignLensNotice` renders this on both homes and
 * clears it when it unmounts, which makes it one-shot — it explains the
 * navigation that just happened and does not follow the user around.
 *
 * Module-level rather than in `useUiStore`, and the honest reason is
 * cohesion, not necessity — the guard reaches Pinia perfectly well two lines
 * above, so this is not the `pendingBundleFile` case of code that runs before
 * the app has a store. Either would work identically. It lives here so the
 * fence is one file: the classification, the rule, the resolver, and the one
 * signal any of them emits. Its sole writer is the guard below it.
 */
export const lensRefusal = ref<{
  lens: CampaignRole;
  role: CampaignRole | null;
} | null>(null);
