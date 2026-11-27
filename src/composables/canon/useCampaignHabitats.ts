import { computed } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { toast } from "@/lib/toast";
import { CANON_KEY } from "@/lib/campaignLiveSync/registry";
import { useCampaignStore } from "@/stores/campaign";
import type { Habitat, HabitatLife } from "@/lib/canon/habitats";
import { fetchFormsOfSpecies, fetchHabitatLife, fetchHabitats, fetchHabitatSpecies } from "@/lib/canon/canonCampaignReads";
import type { Abundance, HabitatSpecies } from "@/lib/canon/ecologyTypes";

/**
 * The ecology of the world (#1255 item 31): `campaign_habitats`, the Atlas places each covers
 * (`campaign_habitat_places`) and what lives in each (`campaign_habitat_life`, read by name through
 * `campaign_habitat_life_named`). All DM-only and all ringing the doorbell under the canon root, so every read here
 * is refreshed by it. The database holds a habitat's shares to 100 (checked at commit, 23514) and a place to one
 * habitat (23505); a write the database refuses is a toast in plain words and the screen re-reads what the server has.
 *
 * Since #1283 what lives in a habitat is a species (`campaign_habitat_species`, with how common it is there) and the
 * roll is per form (`campaign_habitat_life`: a share the DM typed, or null for one worked out in code).
 */


/** Postgres `check_violation`: the commit-time total when a habitat's shares would pass 100. */
export const CHECK_VIOLATION = "23514";
/** Postgres `unique_violation`: a place already in a habitat, or a species already living in this one. */
const UNIQUE_VIOLATION = "23505";

export interface HabitatPlace {
  id: string;
  habitatId: string;
  locationId: string;
}


interface PlaceRow {
  id: string;
  habitat_id: string;
  location_id: string;
}


export async function fetchHabitatPlaces(campaignId: string): Promise<HabitatPlace[]> {
  const { data, error } = await supabase
    .from("campaign_habitat_places")
    .select("id, habitat_id, location_id")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as PlaceRow[]).map((r) => ({ id: r.id, habitatId: r.habitat_id, locationId: r.location_id }));
}

/** What is on every habitat's roll, by form; a stat block this reader may not read keeps its row and a placeholder name. */

/** The place after the last row of a table's list (within one habitat when `habitatId` is given). */
export async function nextSortOrder(table: "campaign_habitats" | "campaign_habitat_life" | "campaign_peoples" | "campaign_species" | "campaign_clades" | "campaign_habitat_species", campaignId: string, habitatId?: string): Promise<number> {
  let query = supabase.from(table).select("sort_order").eq("campaign_id", campaignId);
  if (habitatId !== undefined) query = query.eq("habitat_id", habitatId);
  const last = await query.order("sort_order", { ascending: false }).limit(1);
  if (last.error) throw last.error;
  return last.data.length > 0 ? (last.data[0] as { sort_order: number }).sort_order + 1 : 0;
}

/** Adds a habitat after the last one and returns it, so the editor can open on it. */
export async function insertHabitat(campaignId: string, name: string): Promise<string> {
  const sortOrder = await nextSortOrder("campaign_habitats", campaignId);
  const { data, error } = await supabase.from("campaign_habitats").insert({ campaign_id: campaignId, name, sort_order: sortOrder }).select("id").single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export interface HabitatPatch {
  name?: string;
  description?: string | null;
  sort_order?: number;
  other_percent?: number | null;
}

export async function updateHabitat(id: string, patch: HabitatPatch): Promise<void> {
  // RLS answers a write it refuses with no error and no row; asking for the row back is how that is told from a save.
  const { data, error } = await supabase.from("campaign_habitats").update(patch).eq("id", id).select("id");
  if (error) throw error;
  if (data.length === 0) throw new Error("That habitat is gone, or you may not change it.");
}

export async function deleteHabitat(id: string): Promise<void> {
  const { error } = await supabase.from("campaign_habitats").delete().eq("id", id);
  if (error) throw error;
}

export async function insertHabitatPlace(campaignId: string, habitatId: string, locationId: string): Promise<void> {
  const { error } = await supabase.from("campaign_habitat_places").insert({ campaign_id: campaignId, habitat_id: habitatId, location_id: locationId });
  if (error) throw error;
}

export async function deleteHabitatPlace(id: string): Promise<void> {
  const { error } = await supabase.from("campaign_habitat_places").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Puts a species in a habitat, and on its roll puts each of its forms that has a stat block and is not a domesticated
 * breed (a household cat is not met in the wild), each with no share of its own: the code works one out.
 */
export async function insertHabitatSpecies(campaignId: string, habitatId: string, speciesId: string, abundance: Abundance | null = null): Promise<void> {
  const sortOrder = await nextSortOrder("campaign_habitat_species", campaignId, habitatId);
  const forms = await fetchFormsOfSpecies(campaignId, speciesId);
  const { error } = await supabase.from("campaign_habitat_species").insert({ campaign_id: campaignId, habitat_id: habitatId, species_id: speciesId, abundance, sort_order: sortOrder });
  if (error) throw error;
  const onRoll = forms.filter((f) => !f.domesticated && (f.monsterId !== null || f.libraryMonsterId !== null));
  if (onRoll.length === 0) return;
  try {
    let next = await nextSortOrder("campaign_habitat_life", campaignId, habitatId);
    const { error: lifeError } = await supabase.from("campaign_habitat_life").insert(
      onRoll.map((f) => ({ campaign_id: campaignId, habitat_id: habitatId, species_id: speciesId, form_id: f.id, percent: null, sort_order: next++ })),
    );
    if (lifeError) throw lifeError;
  } catch (failure) {
    // Two requests, not one transaction: if the roll cannot be written, take the species back out, so it is not left
    // living here with nothing on its roll and a retry is not refused as "already lives here".
    // A habitat holds a species once (campaign_habitat_species_once), so habitat and species name this one row.
    await supabase.from("campaign_habitat_species").delete().eq("campaign_id", campaignId).eq("habitat_id", habitatId).eq("species_id", speciesId);
    throw failure;
  }
}

export async function updateHabitatSpeciesAbundance(id: string, abundance: Abundance | null): Promise<void> {
  const { data, error } = await supabase.from("campaign_habitat_species").update({ abundance }).eq("id", id).select("id");
  if (error) throw error;
  if (data.length === 0) throw new Error("That species is gone, or you may not change it.");
}

/** The database cascade takes the species' forms off this habitat's roll with it. */
export async function deleteHabitatSpecies(id: string): Promise<void> {
  const { error } = await supabase.from("campaign_habitat_species").delete().eq("id", id);
  if (error) throw error;
}

/** Puts one form on a habitat's roll, with no share of its own. The habitat must already hold the species. */
export async function insertFormOnRoll(campaignId: string, habitatId: string, speciesId: string, formId: string): Promise<void> {
  const sortOrder = await nextSortOrder("campaign_habitat_life", campaignId, habitatId);
  const { error } = await supabase
    .from("campaign_habitat_life")
    .insert({ campaign_id: campaignId, habitat_id: habitatId, species_id: speciesId, form_id: formId, percent: null, sort_order: sortOrder });
  if (error) throw error;
}

/** Null puts the share back to being worked out. */
export async function updateFormPercent(id: string, percent: number | null): Promise<void> {
  const { data, error } = await supabase.from("campaign_habitat_life").update({ percent }).eq("id", id).select("id");
  if (error) throw error;
  if (data.length === 0) throw new Error("That form is gone, or you may not change it.");
}

export async function deleteFormFromRoll(id: string): Promise<void> {
  const { error } = await supabase.from("campaign_habitat_life").delete().eq("id", id);
  if (error) throw error;
}

/** The sentence for a refusal the database makes on purpose; anything else is the error's own words. */
export function habitatWriteMessage(e: unknown, onUnique: string): string {
  const code = typeof e === "object" && e !== null && "code" in e ? e.code : null;
  if (code === CHECK_VIOLATION) return "These shares would pass 100%.";
  if (code === UNIQUE_VIOLATION) return onUnique;
  return toast.fromError(e);
}

/** The active campaign's habitats in the DM's order. Refreshed by the doorbell (the three tables ring under the canon root). */
export function useCampaignHabitats(wanted: () => boolean = () => true) {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  // `wanted` lets a caller that lives as long as a panel (the Familiar's encounter card) read nothing until it needs it.
  const enabled = computed(() => !!campaignId.value && wanted());
  const need = (cid: string | null): string => {
    if (cid === null) throw new Error("useCampaignHabitats fetched without a campaign");
    return cid;
  };
  const habitats = useQuery({
    queryKey: computed(() => [CANON_KEY, "habitats", campaignId.value] as const),
    queryFn: ({ queryKey: [, , cid] }) => fetchHabitats(need(cid)),
    enabled,
  });
  const places = useQuery({
    queryKey: computed(() => [CANON_KEY, "habitat-places", campaignId.value] as const),
    queryFn: ({ queryKey: [, , cid] }) => fetchHabitatPlaces(need(cid)),
    enabled,
  });
  const habitatSpecies = useQuery({
    queryKey: computed(() => [CANON_KEY, "habitat-species", campaignId.value] as const),
    queryFn: ({ queryKey: [, , cid] }) => fetchHabitatSpecies(need(cid)),
    enabled,
  });
  const life = useQuery({
    queryKey: computed(() => [CANON_KEY, "habitat-life", campaignId.value] as const),
    queryFn: ({ queryKey: [, , cid] }) => fetchHabitatLife(need(cid)),
    enabled,
  });
  return {
    habitats: computed<Habitat[]>(() => habitats.data.value ?? []),
    habitatSpecies: computed<HabitatSpecies[]>(() => habitatSpecies.data.value ?? []),
    places: computed<HabitatPlace[]>(() => places.data.value ?? []),
    life: computed<HabitatLife[]>(() => life.data.value ?? []),
    /** True once all four reads have answered (or failed): an empty list is then an answer, not a read still on its way. */
    ready: computed(() => [habitats, places, habitatSpecies, life].every((q) => q.data.value !== undefined || q.isError.value)),
    isLoading: computed(() => habitats.isLoading.value || places.isLoading.value || habitatSpecies.isLoading.value || life.isLoading.value),
    isError: computed(() => habitats.isError.value || places.isError.value || habitatSpecies.isError.value || life.isError.value),
  };
}

/** The habitats and every write, for the screen that edits them. A write that fails refreshes too, so the screen shows what the server has. */
export function useHabitatEditing() {
  const campaign = useCampaignStore();
  const qc = useQueryClient();
  const reads = useCampaignHabitats();

  function write<A, R = void>(run: (arg: A) => Promise<R>, onUnique = "That is already there.") {
    return useMutation({
      mutationFn: run,
      onError: (e) => toast.error(habitatWriteMessage(e, onUnique)),
      onSettled: () => qc.invalidateQueries({ queryKey: [CANON_KEY] }),
    });
  }
  const campaignId = (): string => {
    const id = campaign.activeCampaignId;
    if (!id) throw new Error("No campaign is open.");
    return id;
  };

  const add = write((name: string) => insertHabitat(campaignId(), name));
  const reorder = write(async (ids: string[]) => {
    // Written as the position, not swapped with a neighbour: two habitats sharing a sort_order still move.
    for (const [index, id] of ids.entries()) await updateHabitat(id, { sort_order: index });
  });
  const rename = write(({ id, name }: { id: string; name: string }) => updateHabitat(id, { name }));
  const remove = write(deleteHabitat);
  const addPlace = write(({ habitatId, locationId }: { habitatId: string; locationId: string }) => insertHabitatPlace(campaignId(), habitatId, locationId), "That place is already in another habitat.");
  const removePlace = write(deleteHabitatPlace);
  const addSpecies = write(({ habitatId, speciesId }: { habitatId: string; speciesId: string }) => insertHabitatSpecies(campaignId(), habitatId, speciesId), "That species already lives here.");
  const abundance = write(({ id, value }: { id: string; value: Abundance | null }) => updateHabitatSpeciesAbundance(id, value));
  const removeSpecies = write(deleteHabitatSpecies);
  const addForm = write(({ habitatId, speciesId, formId }: { habitatId: string; speciesId: string; formId: string }) => insertFormOnRoll(campaignId(), habitatId, speciesId, formId), "That form is already on the roll.");
  const removeForm = write(deleteFormFromRoll);
  const formPercent = write(({ id, percent }: { id: string; percent: number | null }) => updateFormPercent(id, percent));
  const other = write(({ habitatId, percent }: { habitatId: string; percent: number | null }) => updateHabitat(habitatId, { other_percent: percent }));

  return {
    ...reads,
    /** Resolves to the new habitat's id so the editor can open on it; a failure is already a toast, and resolves to null. */
    addHabitat: (name: string) => add.mutateAsync(name).catch(() => null),
    renameHabitat: (id: string, name: string) => rename.mutate({ id, name }),
    /** For an autosaving field: throws, so the field's own status line says it failed. */
    saveDescription: async (id: string, description: string | null): Promise<void> => {
      await updateHabitat(id, { description });
      await qc.invalidateQueries({ queryKey: [CANON_KEY, "habitats"] });
    },
    /** The habitats' ids in their new order. */
    reorderHabitats: (ids: string[]) => reorder.mutate(ids),
    removeHabitat: (id: string) => remove.mutate(id),
    addPlace: (habitatId: string, locationId: string) => addPlace.mutate({ habitatId, locationId }),
    removePlace: (id: string) => removePlace.mutate(id),
    // `mutate`, not `mutateAsync`: a failure is already a toast, and a rejected promise nobody awaits is noise.
    addHabitatSpecies: (habitatId: string, speciesId: string) => addSpecies.mutate({ habitatId, speciesId }),
    setAbundance: (habitatSpeciesId: string, value: Abundance | null) => abundance.mutate({ id: habitatSpeciesId, value }),
    /** The database cascade takes the species' forms off this habitat's roll. */
    removeHabitatSpecies: (habitatSpeciesId: string) => removeSpecies.mutate(habitatSpeciesId),
    addFormToRoll: (habitatId: string, speciesId: string, formId: string) => addForm.mutate({ habitatId, speciesId, formId }),
    removeFormFromRoll: (lifeId: string) => removeForm.mutate(lifeId),
    /** Null puts the share back to being worked out. */
    setFormPercent: (lifeId: string, percent: number | null) => formPercent.mutate({ id: lifeId, percent }),
    /** The share for "anything else"; null leaves it to the generator. */
    setOtherPercent: (habitatId: string, percent: number | null) => other.mutate({ habitatId, percent }),
  };
}
