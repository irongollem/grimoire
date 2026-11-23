import { computed } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { fetchCanonEntries } from "@/lib/canon/canonEntries";
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

  const entries = useQuery({
    queryKey: computed(() => [CANON_KEY, campaignId.value] as const),
    queryFn: ({ queryKey: [, cid] }) => {
      if (cid === null) throw new Error("useCanonOnCalendar fetched without a campaign");
      return fetchCanonEntries(cid);
    },
    enabled,
  });
  const forceData = useQuery({
    queryKey: computed(() => [CANON_KEY, "forces", campaignId.value] as const),
    queryFn: ({ queryKey: [, , cid] }) => {
      if (cid === null) throw new Error("useCanonOnCalendar fetched without a campaign");
      return fetchCanonForceData(cid);
    },
    enabled,
  });

  const items = computed<CanonCalendarItem[]>(() => {
    if (!enabled.value) return [];
    const all = entries.data.value ?? [];
    return canonCalendarItems({
      lore: all.filter((e) => e.part === "lore"),
      forces: all.filter((e) => e.part === "force"),
      ticks: forceData.data.value?.ticks ?? [],
    });
  });

  return { items, enabled };
}
