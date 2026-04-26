import type { Router } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";

export { routes } from "./routes";

export function setupRouterGuard(router: Router) {
  router.beforeEach(async (to) => {
    if (import.meta.env.SSR) return;

    const auth = useAuthStore();
    await auth.initialize();
    await auth.ensureFreshSession();

    if (to.meta.requiresAuth && !auth.isAuthenticated) {
      return { name: "login", query: { redirect: to.fullPath } };
    }
    if (to.meta.requiresGuest && auth.isAuthenticated) {
      return { name: "dashboard" };
    }

    // Players are redirected away from DM routes to the player portal
    if (auth.isAuthenticated && auth.isPlayer && !to.meta.requiresPlayer && !to.meta.playerReadable && to.name !== "join-campaign") {
      return { name: "play" };
    }

    // Players can't manually navigate to /play if they're actually a DM
    // Exceptions:
    //   - DM preview mode lets the DM browse the full player portal
    //   - A memberId query param means the DM is managing a specific character
    const ui = useUiStore();
    const dmManagingMember = auth.isDM && !!to.query.memberId;
    if (to.meta.requiresPlayer && auth.isDM && !ui.dmPreviewMode && !dmManagingMember) {
      return { name: "dashboard" };
    }
  });
}

