import { computed } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { stepOnCalendar } from "@/lib/canon/stepCalendar";
import { useCanonEntries } from "@/composables/canon/useCanonEntries";
import { canonCalendarItems, canonOnCalendarEnabled, type CanonCalendarItem } from "@/lib/canon/canonCalendar";
import { CANON_KEY } from "@/lib/campaignLiveSync/registry";
import { fetchCanonForceData } from "@/composables/canon/useCanonForces";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { useAppUiStore } from "@/stores/ui/app";
import { useCalendarUiStore } from "@/stores/ui/calendar";

/**
 * The canon's dated lore and force moves, for the Calendar's timeline. Both reads are DM-only, so they are `enabled`
 * only for the DM outside player preview with the toggle on: a player's Calendar never asks for them. They share the
 * Canon page's query keys, so the page's cache and the campaign doorbell serve both.
 */
export function useCanonOnCalendar() {
  const auth = useAuthStore();
  const campaign = useCampaignStore();
  const app = useAppUiStore();
  const ui = useCalendarUiStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  const enabled = computed(() =>
    canonOnCalendarEnabled({ isDM: auth.isDM, dmPreview: app.dmPreviewMode, show: ui.showCanonOnCalendar, campaignId: campaignId.value }),
  );

  const entries = useCanonEntries({ enabled });
  const forceData = useQuery({
    queryKey: computed(() => [CANON_KEY, "forces", campaignId.value] as const),
    queryFn: ({ queryKey: [, , cid] }) => {
      if (cid === null) throw new Error("useCanonOnCalendar fetched without a campaign");
      return fetchCanonForceData(cid);
    },
    enabled,
  });

  // A step the DM has put on the Calendar is an event there, so its "A step due" line is not drawn a second time (#1279 item 32).

  const items = computed<CanonCalendarItem[]>(() => {
    if (!enabled.value) return [];
    const all = entries.data.value ?? [];
    return canonCalendarItems({
      lore: all.filter((e) => e.part === "lore"),
      forces: all.filter((e) => e.part === "force"),
      ticks: forceData.data.value?.ticks ?? [],
      steps: (forceData.data.value?.steps ?? []).filter((s) => !stepOnCalendar(s)),
    });
  });

  return { items, enabled };
}
