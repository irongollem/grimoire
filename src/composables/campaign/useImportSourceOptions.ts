/**
 * The DM's own "Source book" history — what `DocumentImportWizard.vue`'s and
 * `QuestPasteImportPanel.vue`'s "Source book" field offers as suggestions,
 * and what it prefills from (#site-workbench decision, 18 Sep 2026). See
 * `src/lib/documentImport/sourceTitle.ts` for the pure ranking/filtering this
 * composable's query result runs through.
 *
 * Queries the DM's own `monsters`/`items`/`spells` rows directly (three plain
 * `supabase` reads, like every other lookup in this feature — see
 * `useDocumentImportRunner.ts`), excluding anything Open5e/library-sourced:
 * `open5e_import = true` or a non-null `source_document_key` both mark a row
 * that isn't the DM's own naming of a book. `items` has no `open5e_import`
 * column at all, so that half of the filter only applies to the other two.
 */
import { computed } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { pickDefaultSourceTitle, rankSourceOptions, type SourceTitleRow } from "@/lib/documentImport/sourceTitle";

const SOURCED_TABLES = [
  { table: "monsters", hasOpen5eColumn: true },
  { table: "items", hasOpen5eColumn: false },
  { table: "spells", hasOpen5eColumn: true },
] as const;

async function fetchOwnSourceRows(userId: string, table: string, hasOpen5eColumn: boolean): Promise<SourceTitleRow[]> {
  let query = supabase.from(table).select("source, campaign_id").eq("user_id", userId).not("source", "is", null).is("source_document_key", null);
  if (hasOpen5eColumn) query = query.eq("open5e_import", false);
  const { data, error } = await query;
  if (error || !data) return [];

  const rows: SourceTitleRow[] = [];
  for (const row of data as Record<string, unknown>[]) {
    const source = row.source;
    if (typeof source !== "string") continue;
    const campaignId = typeof row.campaign_id === "string" ? row.campaign_id : null;
    rows.push({ source, campaignId });
  }
  return rows;
}

export function useImportSourceOptions() {
  const campaign = useCampaignStore();

  const query = useQuery({
    queryKey: ["import-source-options"],
    queryFn: async (): Promise<SourceTitleRow[]> => {
      const user = getCurrentUser();
      if (!user) return [];
      const rows = await Promise.all(SOURCED_TABLES.map(({ table, hasOpen5eColumn }) => fetchOwnSourceRows(user.id, table, hasOpen5eColumn)));
      return rows.flat();
    },
    // The DM's own naming history changes rarely, and re-fetching it on every
    // mount of the import wizard/paste panel buys nothing — matches
    // `useImportEntityMatches.ts`'s own reasoning for a long staleTime here.
    staleTime: 5 * 60 * 1000,
  });

  const rows = computed(() => query.data.value ?? []);
  const options = computed(() => rankSourceOptions(rows.value));
  const defaultSourceTitle = computed(() => {
    const campaignId = campaign.activeCampaignId;
    return campaignId ? pickDefaultSourceTitle(rows.value, campaignId) : null;
  });

  return { options, defaultSourceTitle, isLoading: query.isLoading };
}
