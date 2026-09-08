import { useRouter } from "vue-router";
import { useQueryClient } from "@tanstack/vue-query";
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import { useAuthStore } from "@/stores/auth";
import {
  MY_MEMBERSHIPS_KEY,
  fetchMyMemberships,
} from "@/composables/campaign/useCampaignMembers";

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
 *
 * The memberships are resolved *before* the swap so the store can refuse to
 * restore a remembered campaign the target lens does not hold — a DM slot
 * pointing at a campaign this account only plays in is exactly how the DM
 * shell came up on someone else's campaign. It is one small query, cached, on
 * an explicit user action, and it is awaited so the swap never runs against a
 * half-known answer.
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

    const memberships = await queryClient
      .fetchQuery({ queryKey: MY_MEMBERSHIPS_KEY, queryFn: fetchMyMemberships })
      .catch(() => null);

    campaignStore.switchUserMode(ui.userMode, target, {
      rememberCurrentCampaign: options.rememberCurrentCampaign ?? true,
      // A failed lookup leaves the set undefined, which restores as before —
      // a network blip must not cost the user their remembered campaign.
      campaignsInTargetLens: memberships
        ? new Set(memberships.filter((m) => m.role === target).map((m) => m.campaign_id))
        : undefined,
    });
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
