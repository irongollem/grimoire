import { useRouter } from "vue-router";
import { useQueryClient } from "@tanstack/vue-query";
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import { useAuthStore } from "@/stores/auth";

/**
 * The one sanctioned way to flip the DM/Player lens (#729).
 *
 * Order matters: the per-mode campaign swap must happen before the mode ref
 * changes (the swap needs to know which mode is being *left*), and the stale
 * membership must be cleared before navigation or App.vue's
 * `membership?.campaign_id` fallback re-hydrates the campaign the user just
 * left. The full query-cache invalidation mirrors the ownership-transfer
 * flow: the lens change swaps which campaign every campaign-scoped query
 * should be reading for.
 */
export function useModeSwitch() {
  const ui = useUiStore();
  const campaignStore = useCampaignStore();
  const auth = useAuthStore();
  const router = useRouter();
  const queryClient = useQueryClient();

  async function switchMode(
    target: "dm" | "player",
    options: { navigate?: boolean; rememberCurrentCampaign?: boolean } = {},
  ) {
    if (ui.userMode === target) return;

    campaignStore.switchUserMode(
      ui.userMode,
      target,
      options.rememberCurrentCampaign ?? true,
    );
    auth.clearMembership();
    ui.userMode = target;
    ui.exitDmPreview();

    await queryClient.invalidateQueries();
    if (options.navigate ?? true) {
      await router.push(
        target === "dm" ? { name: "dashboard" } : { name: "play-home" },
      );
    }
  }

  return { switchMode };
}
