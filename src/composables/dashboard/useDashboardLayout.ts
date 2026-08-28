import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from "vue";
import { useQuery, useMutation, useQueryClient, type QueryKey } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { useToast } from "@/composables/useToast";
import {
  KNOWN_WIDGET_IDS,
  mergeDashboardLayout,
  parseDashboardLayout,
} from "@/lib/dashboard/savedLayout";
import type { DashboardLayout, DashboardLayoutEntry } from "@/lib/dashboard/defaultLayouts";
import type { DashboardSurface, DashboardWidgetId } from "@/lib/dashboard/widgetCatalog";

/**
 * A DM's saved dashboard arrangement, per campaign and per surface (#762).
 *
 * The row lives in Supabase rather than `localStorage` because a DM preps on a
 * desktop and runs the table on a laptop: `ui.sessionRunning` used to be a
 * `useLocalStorage` value and never being the same twice across devices was
 * the bug #758 existed to kill. A rearranged screen is the same promise.
 *
 * Own-row data under plain RLS — no `SECURITY DEFINER` RPC, because PostgREST
 * under the table's four `auth.uid() = user_id` policies already covers every
 * access this needs, and a definer function would grow the advisor baseline
 * for nothing.
 */

const QUERY_KEY = "dashboard-layout";

interface DashboardLayoutApi {
  /** The merged layout, ready to render. Defaults until a saved row loads. */
  widgets: ComputedRef<DashboardLayoutEntry[]>;
  /** Widget ids that entered the registry after the save — #763 badges these "New". */
  newWidgetIds: ComputedRef<DashboardWidgetId[]>;
  /** Whether this surface packs its grid densely (#768). */
  dense: ComputedRef<boolean>;
  /** Whether a saved row exists — #763 enables "Reset to default" from it. */
  isCustomized: ComputedRef<boolean>;
  isSaving: ComputedRef<boolean>;
  saveLayout: (widgets: DashboardLayoutEntry[], dense: boolean) => Promise<void>;
  resetLayout: () => Promise<void>;
}

/** What `onMutate` hands its siblings: where to roll back to, and into which key. */
interface RollbackContext {
  key: QueryKey;
  previous: DashboardLayout | null | undefined;
}

export function useDashboardLayout(surface: MaybeRefOrGetter<DashboardSurface>): DashboardLayoutApi {
  const campaign = useCampaignStore();
  const queryClient = useQueryClient();
  const toast = useToast();

  const queryKey = computed(() => [QUERY_KEY, campaign.activeCampaignId, toValue(surface)]);

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<DashboardLayout | null> => {
      const user = getCurrentUser();
      const campaignId = campaign.activeCampaignId;
      if (!user || !campaignId) return null;
      const { data, error } = await supabase
        .from("dashboard_layouts")
        .select("layout")
        .eq("user_id", user.id)
        .eq("campaign_id", campaignId)
        .eq("surface", toValue(surface))
        .maybeSingle();
      if (error) throw error;
      // A row whose blob does not parse behaves exactly as a missing one — the
      // fallback is the defaults either way, and half a layout is worse than
      // none. See `parseDashboardLayout` for why this is checked here and not
      // by a jsonb constraint on the table.
      return data === null ? null : parseDashboardLayout(data.layout);
    },
    enabled: () => !!campaign.activeCampaignId && !!getCurrentUser(),
  });

  // No `isLoading` is exposed, and that is the point: merging `null` yields the
  // surface's defaults, so a DM who never customized sees exactly today's
  // dashboard immediately, with no flash of empty grid while the row is
  // fetched, and no skeleton to design for a case that is usually instant.
  const merged = computed(() => mergeDashboardLayout(query.data.value ?? null, toValue(surface)));

  /**
   * Snapshot the cache, write the optimistic value, and remember **which key**
   * to undo into. Capturing the key matters: a campaign or surface switch can
   * land while the request is in flight, and rolling back into whatever key is
   * current by then would corrupt an unrelated campaign's cached layout.
   */
  async function beginOptimistic(next: DashboardLayout | null): Promise<RollbackContext> {
    const key = [...queryKey.value];
    // Awaited, not fired and forgotten: a refetch already in flight would
    // otherwise resolve *after* the optimistic write and put the old
    // arrangement back — the exact mid-drag snap this path exists to avoid.
    await queryClient.cancelQueries({ queryKey: key });
    const previous = queryClient.getQueryData<DashboardLayout | null>(key);
    queryClient.setQueryData(key, next);
    return { key, previous };
  }

  function rollback(context: RollbackContext | undefined, cause: unknown) {
    if (context) queryClient.setQueryData(context.key, context.previous);
    toast.error(toast.fromError(cause));
  }

  const saveMutation = useMutation({
    mutationFn: async ({
      widgets,
      dense,
    }: {
      widgets: DashboardLayoutEntry[];
      dense: boolean;
    }): Promise<DashboardLayout | null> => {
      const user = getCurrentUser();
      const campaignId = campaign.activeCampaignId;
      if (!user || !campaignId) throw new Error("No campaign is open.");
      const { data, error } = await supabase
        .from("dashboard_layouts")
        .upsert(
          {
            user_id: user.id,
            campaign_id: campaignId,
            surface: toValue(surface),
            layout: stamp(widgets, dense),
          },
          { onConflict: "user_id,campaign_id,surface" },
        )
        .select("layout")
        .single();
      if (error) throw error;
      return parseDashboardLayout(data.layout);
    },
    onMutate: ({ widgets, dense }: { widgets: DashboardLayoutEntry[]; dense: boolean }) =>
      beginOptimistic(stamp(widgets, dense)),
    onError: (cause, _widgets, context) => rollback(context, cause),
    // Deliberately no `invalidateQueries`: Customize mode (#763) saves through on
    // every reorder, so a refetch per drag is exactly the flicker the optimistic
    // path exists to prevent. The server's own answer is written back instead.
    onSuccess: (row, _widgets, context) => queryClient.setQueryData(context.key, row),
  });

  const resetMutation = useMutation({
    mutationFn: async (): Promise<void> => {
      const user = getCurrentUser();
      const campaignId = campaign.activeCampaignId;
      if (!user || !campaignId) throw new Error("No campaign is open.");
      const { error } = await supabase
        .from("dashboard_layouts")
        .delete()
        .eq("user_id", user.id)
        .eq("campaign_id", campaignId)
        .eq("surface", toValue(surface));
      if (error) throw error;
    },
    // Deleting the row *is* the reset: absent means "use the defaults", so the
    // optimistic value is `null` and the grid falls back on the next tick.
    onMutate: () => beginOptimistic(null),
    onError: (cause, _void, context) => rollback(context, cause),
  });

  return {
    widgets: computed(() => merged.value.widgets),
    newWidgetIds: computed(() => merged.value.newWidgetIds),
    dense: computed(() => merged.value.dense),
    isCustomized: computed(() => query.data.value != null),
    isSaving: computed(() => saveMutation.isPending.value || resetMutation.isPending.value),
    saveLayout: async (widgets, dense) => {
      await saveMutation.mutateAsync({ widgets, dense });
    },
    resetLayout: async () => {
      await resetMutation.mutateAsync();
    },
  };
}

/**
 * Record what the registry offered at save time.
 *
 * Stamped here rather than by the caller on purpose: `known` is what lets the
 * merge tell a widget the DM removed from one that shipped afterwards, and a
 * save that forgot it would make every widget look new on the next load.
 * Customize mode should not have to remember a field it never reads.
 */
function stamp(widgets: DashboardLayoutEntry[], dense: boolean): DashboardLayout {
  // `dense` is written only when on, so a layout that never opted in stays
  // byte-identical to one saved before #768 — and reads back the same way.
  const layout: DashboardLayout = { widgets, known: [...KNOWN_WIDGET_IDS] };
  if (dense) layout.dense = true;
  return layout;
}
