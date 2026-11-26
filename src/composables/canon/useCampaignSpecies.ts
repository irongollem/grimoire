import { computed } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { toast } from "@/lib/toast";
import { CANON_KEY } from "@/lib/campaignLiveSync/registry";
import { useCampaignStore } from "@/stores/campaign";
import { CHECK_VIOLATION, nextSortOrder } from "@/composables/canon/useCampaignHabitats";
import { fetchClades, fetchSpecies, fetchSpeciesForms, fetchSpeciesLinks, fetchSpeciesYields, fetchStatBlockNames } from "@/lib/canon/canonCampaignReads";
import type { Activity, Clade, Kingdom, LinkKind, LivesAs, Species, SpeciesForm, SpeciesLink, SpeciesSeason, SpeciesYield } from "@/lib/canon/ecologyTypes";
import type { SeasonKind } from "@/types/calendar.types";

/**
 * The field guide (#1283): `campaign_clades`, `campaign_species`, their forms, links and yields. DM-only, ringing the
 * doorbell under the canon root, so every read here is refreshed by it. Stat block names are read apart, for only the
 * ids the forms point at.
 */

const UNIQUE_VIOLATION = "23505";

/**
 * The species alone, for a picker or a chip that needs only names (the @-mention list): the same query, under the same
 * key, as `useCampaignSpecies`, so the two share one cache entry, without reading clades, forms, links and yields.
 */
export function useSpeciesList(wanted: () => boolean = () => true) {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  const query = useQuery({
    queryKey: computed(() => [CANON_KEY, "species", campaignId.value] as const),
    queryFn: ({ queryKey: [, , cid] }) => {
      if (cid === null) throw new Error("useSpeciesList fetched without a campaign");
      return fetchSpecies(cid);
    },
    enabled: computed(() => !!campaignId.value && wanted()),
  });
  return { species: computed(() => query.data.value ?? []) };
}

export function useCampaignSpecies(wanted: () => boolean = () => true) {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  const enabled = computed(() => !!campaignId.value && wanted());
  const need = (cid: string | null): string => {
    if (cid === null) throw new Error("useCampaignSpecies fetched without a campaign");
    return cid;
  };
  const clades = useQuery({
    queryKey: computed(() => [CANON_KEY, "clades", campaignId.value] as const),
    queryFn: ({ queryKey: [, , cid] }) => fetchClades(need(cid)),
    enabled,
  });
  const species = useQuery({
    queryKey: computed(() => [CANON_KEY, "species", campaignId.value] as const),
    queryFn: ({ queryKey: [, , cid] }) => fetchSpecies(need(cid)),
    enabled,
  });
  const forms = useQuery({
    queryKey: computed(() => [CANON_KEY, "species-forms", campaignId.value] as const),
    queryFn: ({ queryKey: [, , cid] }) => fetchSpeciesForms(need(cid)),
    enabled,
  });
  const links = useQuery({
    queryKey: computed(() => [CANON_KEY, "species-links", campaignId.value] as const),
    queryFn: ({ queryKey: [, , cid] }) => fetchSpeciesLinks(need(cid)),
    enabled,
  });
  const yields = useQuery({
    queryKey: computed(() => [CANON_KEY, "species-yields", campaignId.value] as const),
    queryFn: ({ queryKey: [, , cid] }) => fetchSpeciesYields(need(cid)),
    enabled,
  });

  const formList = computed<SpeciesForm[]>(() => forms.data.value ?? []);
  const monsterIds = computed(() => [...new Set(formList.value.flatMap((f) => (f.monsterId === null ? [] : [f.monsterId])))].sort());
  const libraryIds = computed(() => [...new Set(formList.value.flatMap((f) => (f.libraryMonsterId === null ? [] : [f.libraryMonsterId])))].sort());
  const names = useQuery({
    queryKey: computed(() => [CANON_KEY, "species-stat-blocks", campaignId.value, monsterIds.value, libraryIds.value] as const),
    queryFn: ({ queryKey: [, , , own, library] }) => fetchStatBlockNames(own, library),
    enabled: computed(() => enabled.value && forms.data.value !== undefined && (monsterIds.value.length > 0 || libraryIds.value.length > 0)),
    // A grown set of forms asks again, but the names already known stay on screen meanwhile.
    placeholderData: (previous) => previous,
  });

  const all = [clades, species, forms, links, yields];
  return {
    clades: computed<Clade[]>(() => clades.data.value ?? []),
    species: computed<Species[]>(() => species.data.value ?? []),
    forms: formList,
    links: computed<SpeciesLink[]>(() => links.data.value ?? []),
    yields: computed<SpeciesYield[]>(() => yields.data.value ?? []),
    /** Each form's stat block name by form id; null when the form has none or this reader may not read it. */
    statBlockNameByForm: computed<Map<string, string | null>>(() => {
      const known = names.data.value;
      return new Map(
        formList.value.map((f) => {
          const id = f.monsterId ?? f.libraryMonsterId;
          return [f.id, id === null || known === undefined ? null : (known.get(id) ?? null)];
        }),
      );
    }),
    /** True once every read has answered (or failed): an empty list is then an answer, not a read still on its way. */
    ready: computed(() => all.every((q) => q.data.value !== undefined || q.isError.value)),
    isLoading: computed(() => all.some((q) => q.isLoading.value)),
    isError: computed(() => all.some((q) => q.isError.value)),
  };
}

export interface SpeciesPatch {
  name?: string;
  scientificName?: string | null;
  cladeId?: string | null;
  kingdom?: Kingdom;
  livesAs?: LivesAs | null;
  activity?: Activity | null;
  seasons?: Partial<Record<SeasonKind, SpeciesSeason>>;
  description?: string | null;
}

export interface CladePatch {
  name?: string;
  rank?: string | null;
  parentId?: string | null;
  description?: string | null;
}

export interface NewForm {
  label: string;
  monsterId?: string | null;
  libraryMonsterId?: string | null;
  domesticated?: boolean;
}

export interface FormPatch {
  label?: string;
  domesticated?: boolean;
  monsterId?: string | null;
  libraryMonsterId?: string | null;
}

export interface NewLink {
  fromSpeciesId: string;
  kind: LinkKind;
  toSpeciesId: string | null;
  fromFormId?: string | null;
  toFormId?: string | null;
  habitatId?: string | null;
  note?: string | null;
}

export interface LinkPatch {
  kind?: LinkKind;
  toSpeciesId?: string | null;
  fromFormId?: string | null;
  toFormId?: string | null;
  habitatId?: string | null;
  note?: string | null;
}

export interface NewYield {
  itemId?: string | null;
  libraryItemId?: string | null;
  note?: string | null;
}

/** The sentence for a refusal the database makes on purpose; anything else is the error's own words. */
export function speciesWriteMessage(e: unknown, onUnique: string, onCheck: string): string {
  const code = typeof e === "object" && e !== null && "code" in e ? e.code : null;
  if (code === CHECK_VIOLATION) return onCheck;
  if (code === UNIQUE_VIOLATION) return onUnique;
  return toast.fromError(e);
}

/** Drops the keys a patch leaves out, so an update never writes `undefined` over a column. */
function defined(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
}

async function writeOne(table: string, id: string, patch: Record<string, unknown>, gone: string): Promise<void> {
  // RLS answers a write it refuses with no error and no row; asking for the row back is how that is told from a save.
  const { data, error } = await supabase.from(table).update(patch).eq("id", id).select("id");
  if (error) throw error;
  if (data.length === 0) throw new Error(gone);
}

async function removeOne(table: string, id: string): Promise<void> {
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) throw error;
}

/** The field guide's writes. Each resolves (a failure is already a toast and resolves to null or undefined) and the screen re-reads what the server has. */
export function useSpeciesEditing() {
  const campaign = useCampaignStore();
  const qc = useQueryClient();
  const reads = useCampaignSpecies();

  const campaignId = (): string => {
    const id = campaign.activeCampaignId;
    if (!id) throw new Error("No campaign is open.");
    return id;
  };
  function write<A, R = void>(run: (arg: A) => Promise<R>, onUnique = "That is already there.", onCheck = "The database refused that.") {
    const m = useMutation({
      mutationFn: run,
      onError: (e) => toast.error(speciesWriteMessage(e, onUnique, onCheck)),
      onSettled: () => qc.invalidateQueries({ queryKey: [CANON_KEY] }),
    });
    return (arg: A): Promise<R | null> => m.mutateAsync(arg).catch(() => null);
  }
  async function insertReturningId(table: string, row: Record<string, unknown>): Promise<string> {
    const { data, error } = await supabase.from(table).insert(row).select("id").single();
    if (error) throw error;
    return (data as { id: string }).id;
  }

  const addSpecies = write(async (name: string) => {
    const cid = campaignId();
    return insertReturningId("campaign_species", { campaign_id: cid, name, sort_order: await nextSortOrder("campaign_species", cid) });
  });
  const updateSpecies = write(({ id, patch }: { id: string; patch: SpeciesPatch }) =>
    writeOne(
      "campaign_species",
      id,
      defined({
        name: patch.name,
        scientific_name: patch.scientificName,
        clade_id: patch.cladeId,
        kingdom: patch.kingdom,
        lives_as: patch.livesAs,
        activity: patch.activity,
        seasons: patch.seasons,
        description: patch.description,
      }),
      "That species is gone, or you may not change it.",
    ),
  );
  const removeSpecies = write((id: string) => removeOne("campaign_species", id));
  const reorderSpecies = write(async (ids: string[]) => {
    // Written as the position, not swapped with a neighbour: two species sharing a sort_order still move.
    for (const [index, id] of ids.entries()) await writeOne("campaign_species", id, { sort_order: index }, "That species is gone, or you may not change it.");
  });

  const addClade = write(async ({ name, parentId }: { name: string; parentId: string | null }) => {
    const cid = campaignId();
    return insertReturningId("campaign_clades", { campaign_id: cid, name, parent_id: parentId, sort_order: await nextSortOrder("campaign_clades", cid) });
  }, "That is already there.", "A clade cannot be inside itself.");
  const updateClade = write(
    ({ id, patch }: { id: string; patch: CladePatch }) =>
      writeOne("campaign_clades", id, defined({ name: patch.name, rank: patch.rank, parent_id: patch.parentId, description: patch.description }), "That clade is gone, or you may not change it."),
    "That is already there.",
    "A clade cannot be inside itself.",
  );
  const removeClade = write((id: string) => removeOne("campaign_clades", id));

  const addForm = write(async ({ speciesId, form }: { speciesId: string; form: NewForm }) => {
    const cid = campaignId();
    const last = await supabase.from("campaign_species_forms").select("stage_order").eq("campaign_id", cid).eq("species_id", speciesId).order("stage_order", { ascending: false }).limit(1);
    if (last.error) throw last.error;
    const stageOrder = last.data.length > 0 ? (last.data[0] as { stage_order: number }).stage_order + 1 : 0;
    return insertReturningId("campaign_species_forms", {
      campaign_id: cid,
      species_id: speciesId,
      label: form.label,
      stage_order: stageOrder,
      domesticated: form.domesticated ?? false,
      monster_id: form.monsterId ?? null,
      library_monster_id: form.libraryMonsterId ?? null,
    });
  }, "That stat block is already a form of another species.");
  const updateForm = write(
    ({ id, patch }: { id: string; patch: FormPatch }) =>
      writeOne("campaign_species_forms", id, defined({ label: patch.label, domesticated: patch.domesticated, monster_id: patch.monsterId, library_monster_id: patch.libraryMonsterId }), "That form is gone, or you may not change it."),
    "That stat block is already a form of another species.",
  );
  const removeForm = write((id: string) => removeOne("campaign_species_forms", id));

  const addLink = write(async (link: NewLink) => {
    await insertReturningId("campaign_species_links", {
      campaign_id: campaignId(),
      from_species_id: link.fromSpeciesId,
      kind: link.kind,
      to_species_id: link.toSpeciesId,
      from_form_id: link.fromFormId ?? null,
      to_form_id: link.toFormId ?? null,
      habitat_id: link.habitatId ?? null,
      note: link.note ?? null,
    });
  });
  const updateLink = write(({ id, patch }: { id: string; patch: LinkPatch }) =>
    writeOne(
      "campaign_species_links",
      id,
      defined({ kind: patch.kind, to_species_id: patch.toSpeciesId, from_form_id: patch.fromFormId, to_form_id: patch.toFormId, habitat_id: patch.habitatId, note: patch.note }),
      "That link is gone, or you may not change it.",
    ),
  );
  const removeLink = write((id: string) => removeOne("campaign_species_links", id));

  const addYield = write(
    async ({ speciesId, item }: { speciesId: string; item: NewYield }) => {
      const cid = campaignId();
      await insertReturningId("campaign_species_yields", {
        campaign_id: cid,
        species_id: speciesId,
        item_id: item.itemId ?? null,
        library_item_id: item.libraryItemId ?? null,
        note: item.note ?? null,
        sort_order: await nextYieldOrder(cid, speciesId),
      });
    },
    "That species already yields that.",
  );
  const removeYield = write((id: string) => removeOne("campaign_species_yields", id));

  return {
    ...reads,
    addSpecies: (name: string) => addSpecies(name),
    updateSpecies: (id: string, patch: SpeciesPatch) => updateSpecies({ id, patch }),
    removeSpecies,
    reorderSpecies,
    addClade: (name: string, parentId: string | null) => addClade({ name, parentId }),
    updateClade: (id: string, patch: CladePatch) => updateClade({ id, patch }),
    removeClade,
    addForm: (speciesId: string, form: NewForm) => addForm({ speciesId, form }),
    updateForm: (id: string, patch: FormPatch) => updateForm({ id, patch }),
    removeForm,
    addLink,
    updateLink: (id: string, patch: LinkPatch) => updateLink({ id, patch }),
    removeLink,
    addYield: (speciesId: string, item: NewYield) => addYield({ speciesId, item }),
    removeYield,
  };
}

async function nextYieldOrder(campaignId: string, speciesId: string): Promise<number> {
  const last = await supabase.from("campaign_species_yields").select("sort_order").eq("campaign_id", campaignId).eq("species_id", speciesId).order("sort_order", { ascending: false }).limit(1);
  if (last.error) throw last.error;
  return last.data.length > 0 ? (last.data[0] as { sort_order: number }).sort_order + 1 : 0;
}
