import type { Router, RouteLocationNormalized } from "vue-router";
import type { QueryClient } from "@tanstack/vue-query";
import { useAuthStore } from "@/stores/auth";
import { useAppUiStore } from "@/stores/ui/app";
import { useCampaignStore } from "@/stores/campaign";
import { preloadLayout } from "@/layouts/layoutLoader";
import {
  isPlayerArea,
  lensContradicts,
  lensRefusal,
  resolveRoleInCampaign,
  routeLens,
} from "./lens";

export { routes } from "./routes";

/**
 * Routes a child account is fenced away from (#919): billing, and the family
 * pages that manage *other* accounts. Everything else a child can reach
 * (`/account` itself, the player portal, a DM's own campaign if they run one)
 * stays open. The server is the real boundary (the edge functions' own
 * `child_account` gate, `is_user_pro`); this is presentation only.
 */
const CHILD_BLOCKED_ROUTE_NAMES = new Set(["billing", "family", "family-add"]);

function isChildBlockedRoute(to: Pick<RouteLocationNormalized, "name">): boolean {
  return typeof to.name === "string" && CHILD_BLOCKED_ROUTE_NAMES.has(to.name);
}

export function setupRouterGuard(router: Router, queryClient: QueryClient) {
  router.beforeEach(async (to) => {
    if (import.meta.env.SSR) return;

    const auth = useAuthStore();
    await auth.initialize();

    if (to.meta.requiresAuth && !auth.isAuthenticated) {
      return { name: "login", query: { redirect: to.fullPath } };
    }

    // #729: routing is fenced by the persisted DM/Player *lens*, not by the
    // active campaign's membership role — which hat you wear is chosen, not
    // inherited from whichever campaign happened to load. Accounts that
    // predate the mode (or a fresh device) infer it once from the loaded
    // membership; an account with no membership anywhere gets the /welcome
    // first-run choice instead of silently landing on the DM dashboard.
    const appUi = useAppUiStore();
    if (auth.isAuthenticated && !appUi.userMode) {
      appUi.userMode = (await auth.inferUserMode()) ?? "";
    }
    const mode = appUi.userMode;
    const home = () =>
      mode === "player"
        ? { name: auth.isPlayer ? "play" : "play-home" }
        : { name: "dashboard" };

    if (to.meta.requiresGuest && auth.isAuthenticated) {
      return home();
    }
    if (to.meta.requiresAdmin && !auth.isAppAdmin) {
      return home();
    }

    // Routes an account must reach whatever its mode: redeeming an invite,
    // setting a new password from a reset link (how a brand-new account with
    // no mode yet gets back in), and the account pages, which belong to no
    // campaign. The last matters for a parent who signs up from a young
    // player's request email (#919): with no mode yet, sending them to
    // /welcome would lose the approval form they came for.
    const modeless = to.name === "join-campaign" || to.name === "reset-password" || to.meta.accountScoped === true;

    if (auth.isAuthenticated && !mode && !to.meta.requiresGuest && to.name !== "welcome" && !modeless) {
      return { name: "welcome" };
    }
    if (auth.isAuthenticated && mode && to.name === "welcome") {
      return home();
    }

    // The /play area belongs to player mode; everything else to DM mode.
    const inPlayerArea = isPlayerArea(to.path);
    const dmManagingMember = auth.isDM && !!to.query.memberId;

    // Player-mode users are redirected away from DM routes...
    if (auth.isAuthenticated && mode === "player" && !inPlayerArea && !to.meta.playerReadable && !modeless) {
      return home();
    }

    // ...and DM-mode users away from the player portal.
    // Exceptions:
    //   - DM preview mode lets the DM browse the full player portal
    //   - A memberId query param means the DM is managing a specific character
    if (mode === "dm" && inPlayerArea && !appUi.dmPreviewMode && !dmManagingMember) {
      return { name: "dashboard" };
    }

    // Campaign-scoped player routes need an actual membership; the
    // playerStandalone ones (character pool, create/edit and its pickers)
    // exist precisely for the member-of-nothing player (#730).
    if (to.meta.requiresPlayer && !to.meta.playerStandalone && !auth.isPlayer && !appUi.dmPreviewMode && !dmManagingMember) {
      return { name: "play-home" };
    }

    // The lens fence (#847). Choosing a hat is #729's job, done above; this is
    // the other half — the active campaign must be one where the chosen role
    // actually holds. See ./lens.ts for why an unresolved role is never
    // grounds to act, and why the eviction is confirmed against the server
    // rather than the cache.
    //
    // Written over the lens rather than for the DM alone, because the rule is
    // symmetric and the DM-only spelling is a hole the co-DM work (#590) would
    // walk straight into. `surface !== mode` is not a violation: a DM previewing
    // the player portal, and a player on a `playerReadable` DM route, are both
    // deliberate crossings that the checks above have already allowed.
    const campaignStore = useCampaignStore();
    const surface = routeLens(to);
    const activeId = campaignStore.activeCampaignId;
    if (surface && surface === mode && activeId) {
      let role = await resolveRoleInCampaign(queryClient, activeId);
      if (lensContradicts(surface, role)) {
        role = await resolveRoleInCampaign(queryClient, activeId, { fresh: true });
      }
      if (lensContradicts(surface, role)) {
        lensRefusal.value = { lens: surface, role: role ?? null };
        campaignStore.clearActiveCampaign();
        // Only when there is somewhere to go: the campaign is already closed,
        // and redirecting home *to* home is a self-redirect the router counts
        // towards its infinite-redirection limit.
        const target = home();
        if (to.name !== target.name) return target;
      }
    }

    // The child-account fence (#919). Independent of the lens fence above: a
    // child may be a DM or a player, and either lens can reach billing or the
    // family pages by path even though nothing in that lens links to them.
    // The auth store holds the fact; a deep link can arrive before it has
    // loaded, so load it here rather than let an unknown read as "not a child".
    // Still unknown after that (the lookup failed) is treated as closed: the
    // next navigation retries, which costs an adult one click, never a child
    // a page it should not see.
    if (auth.isAuthenticated && auth.user && isChildBlockedRoute(to)) {
      if (!auth.childLinkLoaded) await auth.loadChildLink(auth.user.id);
      if (!auth.childLinkLoaded || auth.isChildAccount) return { name: "account" };
    }

    // Deliberately not awaited, and deliberately last. The shells are lazy
    // (see layoutLoader.ts); firing the request here — past every redirect, so
    // we never fetch a shell we are about to navigate away from — puts it in
    // flight alongside the route component instead of one round trip behind
    // it. beforeResolve below awaits the same promise.
    void preloadLayout(to);
  });

  // The app mounts on router.isReady(), so the shell must be resolved before
  // navigation confirms or the first paint is a blank frame. This awaits the
  // request beforeEach already started, so it usually costs nothing.
  router.beforeResolve(async (to) => {
    if (import.meta.env.SSR) return;
    await preloadLayout(to);
  });
}
