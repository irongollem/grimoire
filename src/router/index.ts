import type { Router } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
import { preloadLayout } from "@/layouts/layoutLoader";

export { routes } from "./routes";

export function setupRouterGuard(router: Router) {
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
    const ui = useUiStore();
    if (auth.isAuthenticated && !ui.userMode) {
      ui.userMode = (await auth.inferUserMode()) ?? "";
    }
    const mode = ui.userMode;
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

    if (auth.isAuthenticated && !mode && !to.meta.requiresGuest && to.name !== "welcome" && to.name !== "join-campaign") {
      return { name: "welcome" };
    }
    if (auth.isAuthenticated && mode && to.name === "welcome") {
      return home();
    }

    // The /play area belongs to player mode; everything else to DM mode.
    const inPlayerArea = to.path === "/play" || to.path.startsWith("/play/");
    const dmManagingMember = auth.isDM && !!to.query.memberId;

    // Player-mode users are redirected away from DM routes...
    if (auth.isAuthenticated && mode === "player" && !inPlayerArea && !to.meta.playerReadable && to.name !== "join-campaign") {
      return home();
    }

    // ...and DM-mode users away from the player portal.
    // Exceptions:
    //   - DM preview mode lets the DM browse the full player portal
    //   - A memberId query param means the DM is managing a specific character
    if (mode === "dm" && inPlayerArea && !ui.dmPreviewMode && !dmManagingMember) {
      return { name: "dashboard" };
    }

    // Campaign-scoped player routes need an actual membership; the
    // playerStandalone ones (character pool, create/edit and its pickers)
    // exist precisely for the member-of-nothing player (#730).
    if (to.meta.requiresPlayer && !to.meta.playerStandalone && !auth.isPlayer && !ui.dmPreviewMode && !dmManagingMember) {
      return { name: "play-home" };
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
