import { computed } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { toast } from "@/lib/toast";
import { CANON_KEY } from "@/lib/campaignLiveSync/registry";
import { useCampaignStore } from "@/stores/campaign";
import type { People } from "@/lib/canon/peoples";
import { fetchPeoples } from "@/lib/canon/canonCampaignReads";
import { habitatWriteMessage, nextSortOrder } from "@/composables/canon/useCampaignHabitats";

/**
 * The peoples of the world (#1255 item 30): `campaign_peoples`, each row a species or a creature the campaign already
 * has and its share of the population. Read by name through `campaign_peoples_named`; written to the table. The
 * database holds the shares to 100 and checks that at commit, so a write that would pass it fails here with 23514
 * and the screen shows what the server has.
 */


export interface NewPeople {
  kind: People["kind"];
  recordId: string;
  /** True for a shared book's record (a text id), false for one the DM wrote (a uuid). */
  fromLibrary: boolean;
  percent: number;
  /** The people's own name over the record's; null or blank goes by the record's. */
  name?: string | null;
}


/** Which of the table's four columns a record goes in; exactly one is ever set. */
export function peopleColumn(kind: People["kind"], fromLibrary: boolean): "species_id" | "library_species_id" | "monster_id" | "library_monster_id" {
  if (kind === "species") return fromLibrary ? "library_species_id" : "species_id";
  return fromLibrary ? "library_monster_id" : "monster_id";
}

/** Adds a people after the last one, and answers its id (an accept's undo removes exactly that row). */
export async function insertPeople(campaignId: string, people: NewPeople): Promise<string> {
  const sortOrder = await nextSortOrder("campaign_peoples", campaignId);
  const { data, error } = await supabase.from("campaign_peoples").insert({
    campaign_id: campaignId,
    [peopleColumn(people.kind, people.fromLibrary)]: people.recordId,
    percent: people.percent,
    name: people.name?.trim() || null,
    sort_order: sortOrder,
  }).select("id").single();
  if (error) throw error;
  return data.id;
}

export interface PeoplePlace {
  id: string;
  peopleId: string;
  locationId: string;
}

/** Every Atlas place a people of the campaign lives in. Scoped to the campaign in the query. */
export async function fetchPeoplePlaces(campaignId: string): Promise<PeoplePlace[]> {
  const { data, error } = await supabase
    .from("campaign_people_places")
    .select("id, people_id, location_id")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as { id: string; people_id: string; location_id: string }[]).map((r) => ({ id: r.id, peopleId: r.people_id, locationId: r.location_id }));
}

export async function insertPeoplePlace(campaignId: string, peopleId: string, locationId: string): Promise<void> {
  const { error } = await supabase.from("campaign_people_places").insert({ campaign_id: campaignId, people_id: peopleId, location_id: locationId });
  if (error) throw error;
}

export async function deletePeoplePlace(id: string): Promise<void> {
  const { error } = await supabase.from("campaign_people_places").delete().eq("id", id);
  if (error) throw error;
}

/** The own name a people takes over its record; blank clears it, and the record's name shows again. */
export async function updatePeopleName(id: string, name: string | null): Promise<void> {
  const { data, error } = await supabase.from("campaign_peoples").update({ name: name?.trim() || null }).eq("id", id).select("id");
  if (error) throw error;
  if (data.length === 0) throw new Error("That people is gone, or you may not change it.");
}

export async function updatePeoplePercent(id: string, percent: number): Promise<void> {
  // RLS answers a write it refuses with no error and no row; asking for the row back is how that is told from a save.
  const { data, error } = await supabase.from("campaign_peoples").update({ percent }).eq("id", id).select("id");
  if (error) throw error;
  if (data.length === 0) throw new Error("That people is gone, or you may not change it.");
}

/** What they are like, as the editor's document; null clears it. */
export async function updatePeopleBody(id: string, body: string | null): Promise<void> {
  const { data, error } = await supabase.from("campaign_peoples").update({ body }).eq("id", id).select("id");
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

/** The Atlas places the campaign's peoples live in, refreshed by the doorbell (`campaign_people_places` rings under the canon root). */
export function useCampaignPeoplePlaces() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  const query = useQuery({
    queryKey: computed(() => [CANON_KEY, "people-places", campaignId.value] as const),
    queryFn: ({ queryKey: [, , cid] }) => {
      if (cid === null) throw new Error("useCampaignPeoplePlaces fetched without a campaign");
      return fetchPeoplePlaces(cid);
    },
    enabled: computed(() => !!campaignId.value),
  });
  return { places: computed<PeoplePlace[]>(() => query.data.value ?? []) };
}

/** The peoples and the writes, for the screen that edits them. A write that fails refreshes too, so the screen shows what the server has. */
export function usePeoplesEditing() {
  const campaign = useCampaignStore();
  const qc = useQueryClient();
  const { peoples, isLoading } = useCampaignPeoples();
  const { places } = useCampaignPeoplePlaces();

  function write<A, R = void>(run: (arg: A) => Promise<R>) {
    return useMutation({
      mutationFn: run,
      onError: (e) => toast.error(habitatWriteMessage(e, "That people is already listed. Give this one a name of its own to list it again.")),
      onSettled: () => Promise.all([qc.invalidateQueries({ queryKey: [CANON_KEY, "peoples"] }), qc.invalidateQueries({ queryKey: [CANON_KEY, "people-places"] })]),
    });
  }

  const add = write(async (people: NewPeople) => {
    const campaignId = campaign.activeCampaignId;
    if (!campaignId) throw new Error("No campaign is open.");
    return insertPeople(campaignId, people);
  });
  const setPercentOf = write(({ id, percent }: { id: string; percent: number }) => updatePeoplePercent(id, percent));
  const removeOne = write(deletePeople);
  const rename = write(({ id, name }: { id: string; name: string | null }) => updatePeopleName(id, name));
  const placeIn = write(async ({ peopleId, locationId }: { peopleId: string; locationId: string }) => {
    const campaignId = campaign.activeCampaignId;
    if (!campaignId) throw new Error("No campaign is open.");
    await insertPeoplePlace(campaignId, peopleId, locationId);
  });
  const unplace = write(deletePeoplePlace);
  // The words save themselves and report through the autosave status, so this one neither toasts nor swallows a failure.
  async function saveBody(id: string, body: string | null): Promise<void> {
    try {
      await updatePeopleBody(id, body);
    } finally {
      await qc.invalidateQueries({ queryKey: [CANON_KEY, "peoples"] });
    }
  }

  return {
    peoples,
    isLoading,
    // `mutate`, not `mutateAsync`: a failure is already a toast, and a rejected promise nobody awaits is noise.
    addPeople: (people: NewPeople) => add.mutate(people),
    // For an accept that must know whether the share was written (the Familiar's proposals): it rejects after the toast.
    addPeopleAsync: (people: NewPeople) => add.mutateAsync(people),
    setPercent: (id: string, percent: number) => setPercentOf.mutate({ id, percent }),
    removePeople: (id: string) => removeOne.mutate(id),
    // For an accept's undo, which must know the people is gone before the proposal goes back to pending.
    removePeopleAsync: (id: string) => removeOne.mutateAsync(id),
    saveBody,
    renamePeople: (id: string, name: string | null) => rename.mutate({ id, name }),
    places,
    addPlace: (peopleId: string, locationId: string) => placeIn.mutate({ peopleId, locationId }),
    removePlace: (id: string) => unplace.mutate(id),
  };
}
