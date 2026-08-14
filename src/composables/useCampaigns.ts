import { computed } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { track } from "@/lib/analytics";
import { sendCampaignAnnouncement } from "@/composables/useCampaignBroadcast";
import type { Campaign, CampaignInsert, CampaignUpdate } from "@/types/campaign.types";
import { useToast } from "@/composables/useToast";
import type {
  HomebrewCounts,
  HomebrewDisposition,
  HomebrewKind,
  TransferScopedDisposition,
} from "@/lib/campaignHomebrewDisposition";
import { HOMEBREW_TABLES, EMPTY_HOMEBREW_COUNTS } from "@/lib/campaignHomebrewDisposition";

// All campaign-scoped tables whose orphaned rows (campaign_id IS NULL) can be claimed
const CAMPAIGN_SCOPED_TABLES = [
  "notes",
  "calendar_events",
  "party_members",
  "encounters",
  "npcs",
  "factions",
] as const;

const QUERY_KEY = "campaigns";

async function fetchCampaigns(): Promise<Campaign[]> {
  const { data, error } = await supabase
    .from("campaigns")
    .select("*")
    .eq("is_archived", false)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data as Campaign[];
}

async function fetchArchivedCampaigns(): Promise<Campaign[]> {
  const { data, error } = await supabase
    .from("campaigns")
    .select("*")
    .eq("is_archived", true)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data as Campaign[];
}

async function fetchAllCampaigns(): Promise<Campaign[]> {
  const { data, error } = await supabase
    .from("campaigns")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data as Campaign[];
}

async function createCampaign(campaign: CampaignInsert): Promise<Campaign> {
  const user = getCurrentUser();
  const { data, error } = await supabase
    .from("campaigns")
    .insert({ ...campaign, user_id: user!.id })
    .select()
    .single();
  if (error) throw error;
  // Reported here rather than from a mutation callback: this is the single
  // choke point every campaign creation passes through, and it is past the
  // throw, so the count cannot drift from reality. No campaign name or id is
  // sent — see lib/analytics.ts (#645).
  track({ name: "campaign_created" });
  return data as Campaign;
}

async function updateCampaign(id: string, update: CampaignUpdate): Promise<Campaign> {
  const { data, error } = await supabase
    .from("campaigns")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Campaign;
}

/**
 * Rows scoped exclusively to `campaignId` in each homebrew table — never rows
 * with `campaign_id IS NULL` (already universal, see `allowedCampaignScoped`)
 * and never another campaign's rows. Used to tell the DM what a campaign
 * delete would affect before they choose a disposition (#585, widened to
 * monsters/traps/puzzles by #597).
 *
 * Driven off `HOMEBREW_TABLES` rather than a hand-written list: the count, the
 * RPC's disposition branches and the FK are three places that must agree, and
 * a kind missing from this one is the quiet failure — the DM is never asked,
 * so the delete hits the `NO ACTION` constraint and reports a raw FK error.
 */
async function countScopedHomebrew(campaignId: string): Promise<HomebrewCounts> {
  const kinds = Object.keys(HOMEBREW_TABLES) as HomebrewKind[];
  const results = await Promise.all(
    kinds.map((kind) =>
      supabase
        .from(HOMEBREW_TABLES[kind])
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaignId),
    ),
  );
  const counts = { ...EMPTY_HOMEBREW_COUNTS };
  results.forEach((result, i) => {
    if (result.error) throw result.error;
    counts[kinds[i]] = result.count ?? 0;
  });
  return counts;
}

/**
 * Resolves homebrew scoped exclusively to `campaignId` per the chosen
 * `disposition`, then deletes the campaign. This is the single place that
 * satisfies the `NO ACTION` FK on `custom_classes.campaign_id` /
 * `custom_subclasses.campaign_id` / `class_features.campaign_id` (#585) —
 * both the DM-facing delete flow (`DangerZoneTab`) and the failed-import
 * rollback (`useCampaignBackup`) call this instead of deleting `campaigns`
 * directly, so neither can silently promote or destroy homebrew.
 *
 * "promote" sets `campaign_id = null` (the homebrew becomes universal);
 * "delete" removes the rows. Either way only rows scoped to *this* campaign
 * are touched — 0 matching rows is a harmless no-op, so callers that already
 * know there's nothing scoped may pass either disposition.
 *
 * Routed through the `delete_campaign_with_homebrew` SECURITY DEFINER RPC
 * (see `supabase/migrations/20260730000011_delete_campaign_with_homebrew.sql`)
 * rather than doing the disposition and the campaign delete as two separate
 * round trips: a PL/pgSQL function body runs inside the caller's single
 * statement transaction, so either everything commits or nothing does. Two
 * round trips could fail in between — e.g. homebrew already deleted while
 * the campaign still exists, or already promoted (a silent leak, the exact
 * thing this design exists to prevent) — and worse, be unretryable: a second
 * attempt would see zero scoped rows and never re-offer the choice.
 */
/**
 * The RPC authorizes from `auth.uid()` and mirrors `campaigns`' real DELETE
 * gate — plain ownership, deliberately NOT `private.is_campaign_dm`. That
 * helper admits co-DMs, so using it here would quietly widen who can destroy a
 * campaign from "the owner" to "any DM".
 */
export async function disposeHomebrewAndDeleteCampaign(
  campaignId: string,
  disposition: HomebrewDisposition,
): Promise<void> {
  const { error } = await supabase.rpc("delete_campaign_with_homebrew", {
    p_campaign_id: campaignId,
    p_disposition: disposition,
  });
  if (error) throw error;
}

/**
 * Hands a campaign to another of its members, permanently.
 *
 * Routed through the `transfer_campaign_ownership` SECURITY DEFINER RPC
 * (see `supabase/migrations/20260731000001_transfer_campaign_ownership.sql`)
 * because "who owns a campaign" is not one column. Roughly forty campaign-scoped
 * tables gate their RLS on `auth.uid() = user_id` rather than on
 * `is_campaign_dm(campaign_id)`, so a transfer has to re-stamp `user_id` across
 * all of them, clone the personal-library rows the campaign hydrates from
 * (monsters, traps, backgrounds, scriptorium docs), and swap the two
 * `campaign_members` roles. Half of that applied is worse than none of it: the
 * outgoing DM would keep read/write on content the new DM cannot see. The
 * wrapper and delegated PL/pgSQL body run in one transaction: all or nothing.
 *
 * `leaveCampaign` decides what happens to the outgoing DM: `false` demotes them
 * to a player (they stay in the group), `true` removes their membership.
 * `scopedCopyDisposition` decides whether their original campaign-only monsters
 * and traps become global homebrew, are removed, or are reassigned to another
 * campaign after the recipient's copies have been made. `"reassign"` requires
 * `reassignCampaignId` to name another campaign the caller (still) owns; for
 * every other disposition `reassignCampaignId` must be `null` — the RPC
 * rejects a non-null target paired with a non-reassign disposition, and
 * rejects `"reassign"` whose target is null, equals the transferred campaign,
 * or isn't owned by the caller.
 */
export async function transferCampaignOwnership(
  campaignId: string,
  newOwnerId: string,
  leaveCampaign: boolean,
  scopedCopyDisposition: TransferScopedDisposition,
  reassignCampaignId: string | null,
): Promise<void> {
  const { error } = await supabase.rpc("transfer_campaign_ownership", {
    p_campaign_id: campaignId,
    p_new_owner_id: newOwnerId,
    p_leave_campaign: leaveCampaign,
    p_scoped_copy_disposition: scopedCopyDisposition,
    p_reassign_campaign_id: reassignCampaignId,
  });
  if (error) throw error;
}

/** Assigns all orphaned rows (campaign_id IS NULL) owned by the current user to the given campaign. */
async function claimOrphanedData(campaignId: string): Promise<void> {
  const user = getCurrentUser();
  const userId = user!.id;

  await Promise.all(
    CAMPAIGN_SCOPED_TABLES.map((table) =>
      supabase
        .from(table)
        .update({ campaign_id: campaignId })
        .eq("user_id", userId)
        .is("campaign_id", null),
    ),
  );
}

export function useCampaigns() {
  return useQuery({ queryKey: [QUERY_KEY], queryFn: fetchCampaigns });
}

export function useArchivedCampaigns() {
  return useQuery({ queryKey: [QUERY_KEY, "archived"], queryFn: fetchArchivedCampaigns });
}

export function useAllCampaigns() {
  return useQuery({ queryKey: [QUERY_KEY, "all"], queryFn: fetchAllCampaigns });
}

/** Fetch a single campaign by ID — usable by players after campaigns_member_select RLS is in place */
async function fetchCampaignById(id: string): Promise<Campaign> {
  const { data, error } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as Campaign;
}

export function useCampaignById(id: () => string | null) {
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, id()]),
    queryFn: () => fetchCampaignById(id()!),
    enabled: () => !!id(),
  });
}

/** Homebrew (classes/subclasses/features) scoped exclusively to `id()` — the
 *  DangerZoneTab delete dialog uses this to decide whether the DM needs to
 *  choose a disposition before the campaign can be deleted (#585). */
export function useCampaignScopedHomebrewCounts(id: () => string | null) {
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, id(), "homebrew-counts"]),
    queryFn: () => countScopedHomebrew(id()!),
    enabled: () => !!id(),
  });
}

export function useCreateCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createCampaign,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useUpdateCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: CampaignUpdate }) =>
      updateCampaign(id, update),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

/** Deletes a campaign. Callers must resolve any campaign-scoped homebrew
 *  disposition first — see {@link disposeHomebrewAndDeleteCampaign}. */
export function useDeleteCampaign() {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ id, disposition }: { id: string; disposition: HomebrewDisposition }) =>
      disposeHomebrewAndDeleteCampaign(id, disposition),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      // The disposition may have promoted or deleted homebrew rows — refresh
      // every list that could contain them. Each of these tables happens to be
      // cached under its own name, so the table list doubles as the key list;
      // a key that stops matching costs a stale list until the next refetch,
      // not correctness.
      for (const table of Object.values(HOMEBREW_TABLES)) {
        queryClient.invalidateQueries({ queryKey: [table] });
      }
    },
    onError: (e) => toast.error(toast.fromError(e)),
  });
}

/** Hands the campaign to another member — see {@link transferCampaignOwnership}. */
export function useTransferCampaignOwnership() {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({
      campaignId,
      newOwnerId,
      leaveCampaign,
      scopedCopyDisposition,
      reassignCampaignId,
    }: {
      campaignId: string;
      newOwnerId: string;
      leaveCampaign: boolean;
      scopedCopyDisposition: TransferScopedDisposition;
      reassignCampaignId: string | null;
    }) => transferCampaignOwnership(
      campaignId,
      newOwnerId,
      leaveCampaign,
      scopedCopyDisposition,
      reassignCampaignId,
    ),
    // The caller just gave away read access to nearly every row they had cached
    // for this campaign. Naming the affected keys would mean naming ~40 of them
    // and silently rotting the moment a new one is added, so drop the lot and
    // let the post-transfer navigation refetch what the caller can still see.
    onSuccess: () => queryClient.invalidateQueries(),
    onError: (e) => toast.error(toast.fromError(e)),
  });
}

export function useArchiveCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => updateCampaign(id, { is_archived: true } as CampaignUpdate),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useRestoreCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => updateCampaign(id, { is_archived: false } as CampaignUpdate),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useRegenerateIcalToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (campaignId: string) =>
      updateCampaign(campaignId, { ical_token: crypto.randomUUID() } as CampaignUpdate),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

/** Update the in-game "today" date on the active campaign.
 *  The caller is responsible for also calling fireDueTriggers() after this. */
export function useSetCampaignToday() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      year,
      month,
      day,
    }: {
      id: string;
      year: number;
      month: number;
      day: number;
    }) => updateCampaign(id, { current_year: year, current_month: month, current_day: day } as CampaignUpdate),
    onSuccess: (updatedCampaign, { id, year, month, day }) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      import("@/stores/campaign").then(({ useCampaignStore }) => {
        const store = useCampaignStore();
        if (store.activeCampaign && updatedCampaign) {
          store.activeCampaign = {
            ...store.activeCampaign,
            current_year:  updatedCampaign.current_year,
            current_month: updatedCampaign.current_month,
            current_day:   updatedCampaign.current_day,
          };
        }
      });
      // Announce the date change in the campaign chat so all players see it
      import("@/calendars/index").then(({ getCalendarAdapter }) => {
        const adapter = getCalendarAdapter(updatedCampaign?.calendar_id ?? "faerun");
        const dateStr = adapter.formatDate(year, month, day, null);
        void sendCampaignAnnouncement(id, `📅 The date is now ${dateStr}`);
      });
    },
  });
}

export function useSetCampaignLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, locationId }: { id: string; locationId: string | null }) =>
      updateCampaign(id, { current_location_id: locationId } as CampaignUpdate),
    onSuccess: (updatedCampaign) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      import("@/stores/campaign").then(({ useCampaignStore }) => {
        const store = useCampaignStore();
        if (store.activeCampaign && updatedCampaign) {
          store.activeCampaign = { ...store.activeCampaign, current_location_id: updatedCampaign.current_location_id };
        }
      });
    },
  });
}

export function useClaimOrphanedData() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: claimOrphanedData,
    onSuccess: () => {
      // Invalidate all campaign-scoped queries so they reload with the claimed data
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      queryClient.invalidateQueries({ queryKey: ["party"] });
      queryClient.invalidateQueries({ queryKey: ["encounters"] });
      queryClient.invalidateQueries({ queryKey: ["npcs"] });
      queryClient.invalidateQueries({ queryKey: ["factions"] });
    },
  });
}
