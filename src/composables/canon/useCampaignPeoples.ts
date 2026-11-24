import { computed } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { toast } from "@/lib/toast";
import { CANON_KEY } from "@/lib/campaignLiveSync/registry";
import { useCampaignStore } from "@/stores/campaign";
import { UNREADABLE_PEOPLE, type People } from "@/lib/canon/peoples";

/**
 * The peoples of the world (#1255 item 30): `campaign_peoples`, each row a species or a creature the campaign already
 * has and its share of the population. Read by name through `campaign_peoples_named`; written to the table. The
 * database holds the shares to 100 and checks that at commit, so a write that would pass it fails here with 23514
 * and the screen shows what the server has.
 */

/** Postgres `check_violation`: what the commit-time total raises when the shares would pass 100. */
const CHECK_VIOLATION = "23514";

interface NamedRow {
  id: string;
  percent: number;
  kind: People["kind"];
  record_id: string;
  from_library: boolean;
  /** Null when the record is not this reader's to read (a co-DM's own species): the row still counts. */
  name: string | null;
}

export interface NewPeople {
  kind: People["kind"];
  recordId: string;
  /** True for a shared book's record (a text id), false for one the DM wrote (a uuid). */
  fromLibrary: boolean;
  percent: number;
}

/** The campaign's peoples in the DM's order. Scoped to the campaign in the query: RLS only bounds who may read. */
export async function fetchPeoples(campaignId: string): Promise<People[]> {
  const { data, error } = await supabase
    .from("campaign_peoples_named")
    .select("id, percent, kind, record_id, from_library, name")
    .eq("campaign_id", campaignId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data as NamedRow[]).map((r) => ({
    id: r.id,
    kind: r.kind,
    recordId: r.record_id,
    fromLibrary: r.from_library,
    name: r.name === null ? UNREADABLE_PEOPLE : r.name,
    readable: r.name !== null,
    percent: Number(r.percent),
  }));
}

/** Which of the table's four columns a record goes in; exactly one is ever set. */
export function peopleColumn(kind: People["kind"], fromLibrary: boolean): "species_id" | "library_species_id" | "monster_id" | "library_monster_id" {
  if (kind === "species") return fromLibrary ? "library_species_id" : "species_id";
  return fromLibrary ? "library_monster_id" : "monster_id";
}

/** Adds a people after the last one. */
export async function insertPeople(campaignId: string, people: NewPeople): Promise<void> {
  const last = await supabase
    .from("campaign_peoples")
    .select("sort_order")
    .eq("campaign_id", campaignId)
    .order("sort_order", { ascending: false })
    .limit(1);
  if (last.error) throw last.error;
  const sortOrder = last.data.length > 0 ? (last.data[0] as { sort_order: number }).sort_order + 1 : 0;
  const { error } = await supabase.from("campaign_peoples").insert({
    campaign_id: campaignId,
    [peopleColumn(people.kind, people.fromLibrary)]: people.recordId,
    percent: people.percent,
    sort_order: sortOrder,
  });
  if (error) throw error;
}

export async function updatePeoplePercent(id: string, percent: number): Promise<void> {
  // RLS answers a write it refuses with no error and no row; asking for the row back is how that is told from a save.
  const { data, error } = await supabase.from("campaign_peoples").update({ percent }).eq("id", id).select("id");
  if (error) throw error;
  if (data.length === 0) throw new Error("That people is gone, or you may not change it.");
}

export async function deletePeople(id: string): Promise<void> {
  const { error } = await supabase.from("campaign_peoples").delete().eq("id", id);
  if (error) throw error;
}

/** The active campaign's peoples in the DM's order, for whatever reads them. Refreshed by the doorbell (`campaign_peoples` rings under the canon root). */
export function useCampaignPeoples() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  const query = useQuery({
    queryKey: computed(() => [CANON_KEY, "peoples", campaignId.value] as const),
    queryFn: ({ queryKey: [, , cid] }) => {
      if (cid === null) throw new Error("useCampaignPeoples fetched without a campaign");
      return fetchPeoples(cid);
    },
    enabled: computed(() => !!campaignId.value),
  });
  return { peoples: computed<People[]>(() => query.data.value ?? []), isLoading: query.isLoading };
}

/** The peoples and the three writes, for the screen that edits them. A write that fails refreshes too, so the screen shows what the server has. */
export function usePeoplesEditing() {
  const campaign = useCampaignStore();
  const qc = useQueryClient();
  const { peoples, isLoading } = useCampaignPeoples();

  function write<A>(run: (arg: A) => Promise<void>) {
    return useMutation({
      mutationFn: run,
      onError: (e) => {
        const over = typeof e === "object" && e !== null && "code" in e && e.code === CHECK_VIOLATION;
        toast.error(over ? "These shares would pass 100%." : toast.fromError(e));
      },
      onSettled: () => qc.invalidateQueries({ queryKey: [CANON_KEY, "peoples"] }),
    });
  }

  const add = write(async (people: NewPeople) => {
    const campaignId = campaign.activeCampaignId;
    if (!campaignId) throw new Error("No campaign is open.");
    await insertPeople(campaignId, people);
  });
  const setPercentOf = write(({ id, percent }: { id: string; percent: number }) => updatePeoplePercent(id, percent));
  const removeOne = write(deletePeople);

  return {
    peoples,
    isLoading,
    // `mutate`, not `mutateAsync`: a failure is already a toast, and a rejected promise nobody awaits is noise.
    addPeople: (people: NewPeople) => add.mutate(people),
    setPercent: (id: string, percent: number) => setPercentOf.mutate({ id, percent }),
    removePeople: (id: string) => removeOne.mutate(id),
  };
}
