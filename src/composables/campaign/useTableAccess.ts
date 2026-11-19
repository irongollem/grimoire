import { computed } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";

/**
 * Whether the AI table is open in the active campaign (#1021; `feature_access`, migration `20261119125826`).
 *
 * The table is released to chosen accounts only: it is open in a campaign when the campaign's OWNER has been
 * granted it by an app admin, and the campaign has AI on. Everything that belongs to the table asks here: the nav
 * entry, the routes (`router/index.ts`), having a note read aloud, and the switches that let the AI play a
 * character. The functions hold the same line on the server (`_shared/featureAccess.ts`), so this only decides
 * what is shown. Closed until the answer is in: a limited release fails closed.
 */
export const tableAccessKey = (ownerId: string | null) => ["feature-access", "ai_table", ownerId] as const;

/** Whether this account has been granted the table. The row is readable by the account itself and by the members of a campaign it owns. */
export async function fetchTableAccess(ownerId: string): Promise<boolean> {
  const { data, error } = await supabase.from("feature_access").select("user_id").eq("user_id", ownerId).eq("feature", "ai_table").maybeSingle();
  if (error) throw error;
  return data !== null;
}

export const TABLE_ACCESS_STALE_MS = 5 * 60 * 1000;

export function useTableAccess() {
  const campaign = useCampaignStore();
  const ownerId = computed(() => campaign.activeCampaign?.user_id ?? null);
  const query = useQuery({
    queryKey: computed(() => tableAccessKey(ownerId.value)),
    queryFn: ({ queryKey: [, , id] }) => {
      if (id === null) throw new Error("useTableAccess fetched without a campaign");
      return fetchTableAccess(id);
    },
    enabled: () => ownerId.value !== null,
    staleTime: TABLE_ACCESS_STALE_MS,
  });
  /** The owner has been granted the table, whatever the campaign's AI switch says. */
  const granted = computed(() => query.data.value === true);
  /** The table can be used here: granted, and AI is on for the campaign. */
  const open = computed(() => granted.value && campaign.isAiEnabled);
  return { granted, open };
}
