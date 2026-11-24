import { computed } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { toast } from "@/lib/toast";
import { CANON_KEY } from "@/lib/campaignLiveSync/registry";
import { useCampaignStore } from "@/stores/campaign";
import { UNREADABLE_CREATURE, type Habitat, type HabitatLife } from "@/lib/canon/habitats";

/**
 * The ecology of the world (#1255 item 31): `campaign_habitats`, the Atlas places each covers
 * (`campaign_habitat_places`) and what lives in each (`campaign_habitat_life`, read by name through
 * `campaign_habitat_life_named`). All DM-only and all ringing the doorbell under the canon root, so every read here
 * is refreshed by it. The database holds a habitat's shares to 100 (checked at commit, 23514) and a place to one
 * habitat (23505); a write the database refuses is a toast in plain words and the screen re-reads what the server has.
 */

/** Postgres `check_violation`: the commit-time total when a habitat's shares would pass 100. */
export const CHECK_VIOLATION = "23514";
/** Postgres `unique_violation`: a place already in a habitat, or a creature already in this one. */
const UNIQUE_VIOLATION = "23505";

export interface HabitatPlace {
  id: string;
  habitatId: string;
  locationId: string;
}

interface HabitatRow {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
}

interface PlaceRow {
  id: string;
  habitat_id: string;
  location_id: string;
}

interface LifeRow {
  id: string;
  habitat_id: string;
  record_id: string;
  from_library: boolean;
  percent: number | string;
  /** Null when the creature is not this reader's to read (a co-DM's own): the row still counts toward the total. */
  name: string | null;
}

/** The campaign's habitats in the DM's order. Scoped to the campaign in the query: RLS only bounds who may read. */
export async function fetchHabitats(campaignId: string): Promise<Habitat[]> {
  const { data, error } = await supabase
    .from("campaign_habitats")
    .select("id, name, description, sort_order")
    .eq("campaign_id", campaignId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data as HabitatRow[]).map((r) => ({ id: r.id, name: r.name, description: r.description, sortOrder: r.sort_order }));
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

/** What lives in every habitat of the campaign, by name; a creature this reader may not read keeps its row and a placeholder name. */
export async function fetchHabitatLife(campaignId: string): Promise<HabitatLife[]> {
  const { data, error } = await supabase
    .from("campaign_habitat_life_named")
    .select("id, habitat_id, percent, sort_order, record_id, from_library, name")
    .eq("campaign_id", campaignId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data as LifeRow[]).map((r) => ({
    id: r.id,
    habitatId: r.habitat_id,
    recordId: r.record_id,
    fromLibrary: r.from_library,
    name: r.name === null ? UNREADABLE_CREATURE : r.name,
    readable: r.name !== null,
    percent: Number(r.percent),
  }));
}

/** Which of the table's two creature columns a record goes in; exactly one is ever set. */
export function creatureColumn(fromLibrary: boolean): "library_monster_id" | "monster_id" {
  return fromLibrary ? "library_monster_id" : "monster_id";
}

export interface NewHabitatLife {
  habitatId: string;
  /** A text id for a shared book's creature, a uuid for one the DM wrote. */
  recordId: string;
  fromLibrary: boolean;
  percent: number;
}

/** The place after the last row of a table's list (within one habitat when `habitatId` is given). */
export async function nextSortOrder(table: "campaign_habitats" | "campaign_habitat_life" | "campaign_peoples", campaignId: string, habitatId?: string): Promise<number> {
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

/** Adds a creature to a habitat after the last one there, in the column its source names. */
export async function insertHabitatLife(campaignId: string, life: NewHabitatLife): Promise<void> {
  const sortOrder = await nextSortOrder("campaign_habitat_life", campaignId, life.habitatId);
  const { error } = await supabase.from("campaign_habitat_life").insert({
    campaign_id: campaignId,
    habitat_id: life.habitatId,
    [creatureColumn(life.fromLibrary)]: life.recordId,
    percent: life.percent,
    sort_order: sortOrder,
  });
  if (error) throw error;
}

export async function updateHabitatLifePercent(id: string, percent: number): Promise<void> {
  const { data, error } = await supabase.from("campaign_habitat_life").update({ percent }).eq("id", id).select("id");
  if (error) throw error;
  if (data.length === 0) throw new Error("That creature is gone, or you may not change it.");
}

export async function deleteHabitatLife(id: string): Promise<void> {
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
  const life = useQuery({
    queryKey: computed(() => [CANON_KEY, "habitat-life", campaignId.value] as const),
    queryFn: ({ queryKey: [, , cid] }) => fetchHabitatLife(need(cid)),
    enabled,
  });
  return {
    habitats: computed<Habitat[]>(() => habitats.data.value ?? []),
    places: computed<HabitatPlace[]>(() => places.data.value ?? []),
    life: computed<HabitatLife[]>(() => life.data.value ?? []),
    isLoading: computed(() => habitats.isLoading.value || places.isLoading.value || life.isLoading.value),
    isError: computed(() => habitats.isError.value || places.isError.value || life.isError.value),
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
  const addLife = write((life: NewHabitatLife) => insertHabitatLife(campaignId(), life), "That creature already lives here.");
  const setLifePercent = write(({ id, percent }: { id: string; percent: number }) => updateHabitatLifePercent(id, percent));
  const removeLife = write(deleteHabitatLife);

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
    addLife: (life: NewHabitatLife) => addLife.mutate(life),
    setLifePercent: (id: string, percent: number) => setLifePercent.mutate({ id, percent }),
    removeLife: (id: string) => removeLife.mutate(id),
  };
}
